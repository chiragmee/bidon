-- Phase 1 MVP: place_bid and close_auction follow the domain rules again (packages/domain auction.ts, operations.ts).
--  * Only approved buyers bid ('not_eligible', checked after own_lot and before the EMD, like validateBid).
--  * A bid needs an EMD the seller confirmed ('confirmed'; seeded sample records keep 'succeeded').
--  * At close, EMDs are owed back ('refund_due') instead of being marked refunded: losing bidders' when sold,
--    everyone's when unsold (previously unsold lots left EMDs as paid — D-091). The seller records each refund.
-- Separate migration so the enum values added in 20261016000001 are committed before they are used.

-- One account per legal entity, buyer or seller: PAN and GSTIN are unique among applications under review or
-- approved. Drafts and rejected applications don't count, so nobody can block a business by typing its PAN.
create unique index if not exists companies_pan_key on companies ((upper(eligibility ->> 'pan')))
  where verification in ('pending_review', 'approved') and coalesce(eligibility ->> 'pan', '') <> '';
create unique index if not exists companies_gstin_key on companies ((upper(eligibility ->> 'gstin')))
  where verification in ('pending_review', 'approved') and coalesce(eligibility ->> 'gstin', '') <> '';

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
  v_verification verification_status;
  v_top bids%rowtype;
  v_min bigint;
  v_id text;
begin
  perform app_write_lock();
  v_at := coalesce(p_now, clock_timestamp());

  select * into v_lot from lots where id = p_lot_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  select p.role, c.verification into v_role, v_verification
    from profiles p left join companies c on c.id = p.company_id where p.id = p_bidder_id;
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
  if v_verification is null or v_verification not in ('approved', 'demo_approved') then
    return jsonb_build_object('ok', false, 'code', 'not_eligible');
  end if;
  if not exists (select 1 from emd_records where lot_id = p_lot_id and buyer_id = p_bidder_id and status in ('confirmed', 'succeeded')) then
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
    -- Nobody won: every confirmed EMD is owed back.
    update emd_records set status = 'refund_due' where lot_id = p_lot_id and status = 'confirmed';
    insert into audit_log (id, entity, entity_id, action, actor_id, actor_role, from_status, to_status, reason, at)
    values (next_id('AUD'), 'lot', p_lot_id, v_action, p_actor_id, p_actor_role, 'scheduled', 'closed_unsold', 'No bid met the reserve.', p_now);
    return jsonb_build_object('ok', true, 'status', 'closed_unsold', 'transaction_id', null, 'bidders', coalesce(to_jsonb(v_bidders), '[]'::jsonb));
  end if;

  v_tx := next_id('TX');
  update lots set status = 'awarded', closed_at = p_now, winning_bid_id = v_top.id, end_at = case when p_early then p_now else end_at end where id = p_lot_id;
  insert into transactions (id, lot_id, buyer_id, seller_id, winning_bid_id, price_per_mt, estimated_qty_mt, emd_amount, status, payment_deadline, created_at)
  values (v_tx, p_lot_id, v_top.bidder_id, v_lot.seller_id, v_top.id, v_top.amount_per_mt, v_lot.estimated_qty_mt, v_lot.emd_amount,
          'won_awaiting_balance', p_now + make_interval(hours => p_deadline_hours), p_now);
  -- Losing bidders' confirmed EMDs are owed back; the seller records each refund when made.
  -- Seeded sample EMDs ('succeeded') keep their old simulated behaviour.
  update emd_records set status = 'refund_due'
    where lot_id = p_lot_id and buyer_id <> v_top.bidder_id and status = 'confirmed';
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

revoke all on function place_bid, close_auction from public, anon, authenticated;
