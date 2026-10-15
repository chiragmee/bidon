-- Business-critical writes as Postgres functions (PHASES 2.2). Every writer takes the same
-- transaction-scoped advisory lock, so all writes are serialised (demo scale); place_bid also
-- locks the lot row. Rule order and error codes match packages/domain validateBid exactly.

create or replace function app_write_lock() returns void
language sql as $$ select pg_advisory_xact_lock(4242) $$;

-- Next id for a prefix, continuing after the seed (TX-2000, BID-2000 …).
create or replace function next_id(p_prefix text) returns text
language plpgsql as $$
declare n integer;
begin
  insert into id_counters (prefix, next) values (p_prefix, 2001)
  on conflict (prefix) do update set next = id_counters.next + 1
  returning next - 1 into n;
  return p_prefix || '-' || n;
end $$;

-- ₹ with Indian grouping, matching formatINR in packages/domain.
create or replace function format_inr(n bigint) returns text
language plpgsql immutable as $$
declare s text := abs(n)::text; head text; result text;
begin
  if length(s) <= 3 then
    result := s;
  else
    result := right(s, 3);
    head := left(s, length(s) - 3);
    while length(head) > 2 loop
      result := right(head, 2) || ',' || result;
      head := left(head, length(head) - 2);
    end loop;
    result := head || ',' || result;
  end if;
  return case when n < 0 then '−' else '' end || '₹' || result;
end $$;

create or replace function place_bid(
  p_lot_id text,
  p_bidder_id text,
  p_amount bigint,
  p_client_request_id text,
  p_seen_highest bigint,
  p_now timestamptz default null
) returns jsonb
language plpgsql as $$
declare
  v_at timestamptz;
  v_lot lots%rowtype;
  v_role user_role;
  v_top bids%rowtype;
  v_min bigint;
  v_id text;
begin
  perform app_write_lock();
  -- Time the bid when it actually gets the lock, so bid order and timestamps always agree.
  v_at := coalesce(p_now, clock_timestamp());

  -- Same order as packages/domain placeBid → validateBid, so both return the same code.
  select * into v_lot from lots where id = p_lot_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  select role into v_role from profiles where id = p_bidder_id;
  if v_role is distinct from 'buyer' then
    return jsonb_build_object('ok', false, 'code', 'not_buyer');
  end if;
  if exists (select 1 from bids where client_request_id = p_client_request_id) then
    return jsonb_build_object('ok', false, 'code', 'duplicate');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount');
  end if;

  if v_lot.status = 'draft' then
    return jsonb_build_object('ok', false, 'code', 'not_published');
  end if;
  if v_lot.status = 'scheduled' and v_at < v_lot.start_at then
    return jsonb_build_object('ok', false, 'code', 'auction_not_started');
  end if;
  if v_lot.status <> 'scheduled' or v_at >= v_lot.end_at then
    return jsonb_build_object('ok', false, 'code', 'auction_closed');
  end if;
  if v_lot.seller_id = p_bidder_id then
    return jsonb_build_object('ok', false, 'code', 'own_lot');
  end if;
  if not exists (select 1 from emd_records where lot_id = p_lot_id and buyer_id = p_bidder_id and status = 'succeeded') then
    return jsonb_build_object('ok', false, 'code', 'emd_required');
  end if;

  select * into v_top from bids where lot_id = p_lot_id order by amount_per_mt desc, placed_at asc limit 1;
  v_min := coalesce(v_top.amount_per_mt, v_lot.reserve_per_mt) + v_lot.bid_increment;
  if p_amount < v_min then
    return jsonb_build_object(
      'ok', false,
      'code', case when v_top.id is not null and (p_seen_highest is null or v_top.amount_per_mt > p_seen_highest) then 'outbid' else 'below_minimum' end,
      'min_next', v_min,
      'highest', v_top.amount_per_mt
    );
  end if;

  v_id := next_id('BID');
  insert into bids (id, lot_id, bidder_id, amount_per_mt, placed_at, client_request_id)
  values (v_id, p_lot_id, p_bidder_id, p_amount, v_at, p_client_request_id);
  insert into audit_log (id, entity, entity_id, action, actor_id, actor_role, to_status, at)
  values (next_id('AUD'), 'bid', v_id, 'place_bid', p_bidder_id, 'buyer', format_inr(p_amount) || '/MT', v_at);

  return jsonb_build_object(
    'ok', true,
    'bid_id', v_id,
    'min_next', p_amount + v_lot.bid_increment,
    'previous_leader_id', v_top.bidder_id
  );
end $$;

-- Close an auction from stored bids: winner = highest bid meeting the reserve (earliest on a tie),
-- otherwise unsold. Creates the transaction and refunds losing EMDs (simulated) in one transaction.
create or replace function close_auction(
  p_lot_id text,
  p_actor_id text,
  p_actor_role text,
  p_early boolean,
  p_deadline_hours integer,
  p_now timestamptz default now()
) returns jsonb
language plpgsql as $$
declare
  v_lot lots%rowtype;
  v_top bids%rowtype;
  v_tx text;
  v_action text := case when p_early then 'close_demo_auction' else 'close_auction' end;
  v_bidders text[];
begin
  perform app_write_lock();
  select * into v_lot from lots where id = p_lot_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_lot.status <> 'scheduled' or p_now < v_lot.start_at or (not p_early and p_now < v_lot.end_at) then
    return jsonb_build_object('ok', false, 'code', 'not_live', 'status', v_lot.status);
  end if;

  select array_agg(distinct bidder_id) into v_bidders from bids where lot_id = p_lot_id;
  select * into v_top from bids where lot_id = p_lot_id order by amount_per_mt desc, placed_at asc limit 1;

  if v_top.id is null or v_top.amount_per_mt < v_lot.reserve_per_mt then
    update lots set status = 'closed_unsold', closed_at = p_now, end_at = case when p_early then p_now else end_at end where id = p_lot_id;
    insert into audit_log (id, entity, entity_id, action, actor_id, actor_role, from_status, to_status, reason, at)
    values (next_id('AUD'), 'lot', p_lot_id, v_action, p_actor_id, p_actor_role, 'scheduled', 'closed_unsold', 'No bid met the reserve.', p_now);
    return jsonb_build_object('ok', true, 'status', 'closed_unsold', 'transaction_id', null, 'bidders', coalesce(to_jsonb(v_bidders), '[]'::jsonb));
  end if;

  v_tx := next_id('TX');
  update lots set status = 'awarded', closed_at = p_now, winning_bid_id = v_top.id, end_at = case when p_early then p_now else end_at end where id = p_lot_id;
  insert into transactions (id, lot_id, buyer_id, seller_id, winning_bid_id, price_per_mt, estimated_qty_mt, emd_amount, status, payment_deadline, created_at)
  values (v_tx, p_lot_id, v_top.bidder_id, v_lot.seller_id, v_top.id, v_top.amount_per_mt, v_lot.estimated_qty_mt, v_lot.emd_amount,
          'won_awaiting_balance', p_now + make_interval(hours => p_deadline_hours), p_now);
  update emd_records set status = 'refunded'
    where lot_id = p_lot_id and buyer_id <> v_top.bidder_id and status = 'succeeded';
  insert into audit_log (id, entity, entity_id, action, actor_id, actor_role, from_status, to_status, reason, at)
  values (next_id('AUD'), 'lot', p_lot_id, v_action, p_actor_id, p_actor_role, 'scheduled', 'awarded',
          'Highest bid ' || format_inr(v_top.amount_per_mt) || '/MT met the reserve.', p_now);
  insert into audit_log (id, entity, entity_id, action, actor_id, actor_role, to_status, at)
  values (next_id('AUD'), 'transaction', v_tx, 'create', p_actor_id, p_actor_role, 'won_awaiting_balance', p_now);

  return jsonb_build_object(
    'ok', true,
    'status', 'awarded',
    'transaction_id', v_tx,
    'winner_id', v_top.bidder_id,
    'amount', v_top.amount_per_mt,
    'bidders', coalesce(to_jsonb(v_bidders), '[]'::jsonb)
  );
end $$;

-- Only the server role may call these.
revoke all on function place_bid, close_auction, next_id, app_write_lock from public, anon, authenticated;
