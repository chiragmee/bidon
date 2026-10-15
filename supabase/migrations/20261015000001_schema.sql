-- AuctionIT schema (SPEC §19). All data is demo/sample data.
-- The API connects server-side with the database role (bypasses RLS); RLS is enabled with no
-- policies so the anon/authenticated roles exposed by Supabase can read or write nothing.

create type user_role as enum ('buyer', 'seller', 'ops');
create type company_kind as enum ('buyer', 'seller');
create type verification_status as enum ('demo_approved', 'pending');
create type category_id as enum ('ferrous_hms', 'mixed_steel', 'non_ferrous', 'e_waste', 'machinery');
create type lot_status as enum ('draft', 'scheduled', 'closed_reserve_met', 'closed_unsold', 'awarded');
create type media_kind as enum ('photo', 'video', 'document');
create type media_stage as enum ('listing', 'lifting', 'claim', 'claim_response');
create type emd_status as enum ('succeeded', 'failed', 'refunded', 'forfeited');
create type tx_status as enum (
  'won_awaiting_balance', 'balance_paid', 'lifting_proposed', 'lifting_scheduled', 'material_checked',
  'completed', 'claim_opened', 'under_review', 'resolved', 'defaulted'
);
create type tx_resolution as enum ('completed', 'price_adjustment', 'exit_refund', 'claim_rejected');
create type claim_type as enum ('quantity', 'grade', 'contamination', 'condition');
create type remedy_kind as enum ('price_adjustment', 'exit_refund');
create type claim_status as enum ('open', 'seller_responded', 'under_review', 'resolved', 'rejected');
create type ops_outcome as enum ('approve_adjustment', 'approve_exit', 'reject');

create table companies (
  id text primary key,
  name text not null,
  kind company_kind not null,
  city text not null,
  state text not null,
  business_type text not null,
  yard text,
  sample boolean not null default true,
  verification verification_status not null default 'demo_approved'
);

create table profiles (
  id text primary key,
  name text not null,
  email text not null,
  role user_role not null,
  company_id text references companies (id),
  title text not null default ''
);
create unique index profiles_email_key on profiles (lower(email));

create table lots (
  id text primary key,
  seller_id text not null references profiles (id),
  seller_company_id text not null references companies (id),
  title text not null default '',
  category category_id not null,
  grade text not null default '',
  description text not null default '',
  yard text not null default '',
  city text not null default '',
  state text not null default '',
  estimated_qty_mt numeric(12, 3) not null default 0 check (estimated_qty_mt >= 0),
  contamination_pct numeric(5, 2) check (contamination_pct between 0 and 100),
  declared_grade text not null default '',
  declared_form text not null default '',
  declared_notes text not null default '',
  attributes jsonb not null default '{}',
  reserve_per_mt bigint not null default 0 check (reserve_per_mt >= 0),
  reserve_visible boolean not null default true,
  emd_amount bigint not null default 0 check (emd_amount >= 0),
  bid_increment bigint not null default 0 check (bid_increment >= 0),
  start_at timestamptz,
  end_at timestamptz,
  status lot_status not null default 'draft',
  assurance_enabled boolean not null default false,
  assurance_agreed_at timestamptz,
  measurement_basis text not null default '',
  created_at timestamptz not null default now(),
  published_at timestamptz,
  closed_at timestamptz,
  winning_bid_id text,
  -- Published lots must be complete: reserve > 0 and end after start (SPEC §20).
  constraint lots_published_valid check (
    status = 'draft' or (reserve_per_mt > 0 and emd_amount > 0 and start_at is not null and end_at > start_at)
  ),
  -- A draft may switch assurance on before the seller agrees; a published assured lot must have agreed.
  constraint lots_assurance_agreed check (status = 'draft' or not assurance_enabled or assurance_agreed_at is not null)
);
create index lots_status_end_idx on lots (status, end_at);
create index lots_seller_idx on lots (seller_id);

create table bids (
  id text primary key,
  lot_id text not null references lots (id) on delete cascade,
  bidder_id text not null references profiles (id),
  amount_per_mt bigint not null check (amount_per_mt > 0),
  placed_at timestamptz not null default now(),
  client_request_id text not null unique
);
create index bids_lot_amount_idx on bids (lot_id, amount_per_mt desc, placed_at);

alter table lots add constraint lots_winning_bid_fk foreign key (winning_bid_id) references bids (id) deferrable initially deferred;

create table emd_records (
  id text primary key,
  lot_id text not null references lots (id) on delete cascade,
  buyer_id text not null references profiles (id),
  amount bigint not null check (amount > 0),
  status emd_status not null,
  reference text not null,
  mode text not null default 'simulated' check (mode = 'simulated'),
  created_at timestamptz not null default now()
);
-- At most one live EMD per buyer and lot (failed attempts can repeat).
create unique index emd_one_per_buyer_lot on emd_records (lot_id, buyer_id) where status <> 'failed';

create table transactions (
  id text primary key,
  lot_id text not null unique references lots (id),
  buyer_id text not null references profiles (id),
  seller_id text not null references profiles (id),
  winning_bid_id text not null references bids (id),
  price_per_mt bigint not null check (price_per_mt > 0),
  estimated_qty_mt numeric(12, 3) not null,
  emd_amount bigint not null,
  status tx_status not null,
  balance_paid bigint not null default 0 check (balance_paid >= 0),
  balance_paid_at timestamptz,
  payment_deadline timestamptz not null,
  lifting_proposed_for timestamptz,
  lifting_vehicle text,
  lifting_confirmed_at timestamptz,
  loading_completed_at timestamptz,
  final_qty_mt numeric(12, 3),
  final_payable bigint,
  adjustment bigint not null default 0 check (adjustment >= 0),
  resolution tx_resolution,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tx_buyer_not_seller check (buyer_id <> seller_id)
);
create index transactions_buyer_idx on transactions (buyer_id);
create index transactions_seller_idx on transactions (seller_id);

-- Lot media (listing evidence) and transaction media (lifting photos, tickets, claim evidence).
create table media (
  id text primary key,
  lot_id text references lots (id) on delete cascade,
  transaction_id text references transactions (id) on delete cascade,
  kind media_kind not null,
  url text not null default '',
  caption text not null default '',
  stage media_stage not null,
  uploaded_at timestamptz not null default now(),
  position integer not null default 0,
  constraint media_owner check ((lot_id is null) <> (transaction_id is null))
);
create index media_lot_idx on media (lot_id, position);
create index media_tx_idx on media (transaction_id, position);

-- Weighbridge measurement and condition check are separate records (CLAUDE.md, SPEC §16).
create table weighbridge_measurements (
  transaction_id text primary key references transactions (id) on delete cascade,
  ticket_ref text not null,
  weighbridge text not null,
  gross_mt numeric(12, 3),
  tare_mt numeric(12, 3),
  measured_mt numeric(12, 3) not null check (measured_mt > 0),
  ticket_media_id text,
  measured_at timestamptz not null,
  recorded_by text not null references profiles (id)
);

create table condition_checks (
  transaction_id text primary key references transactions (id) on delete cascade,
  observed_contamination_pct numeric(5, 2) not null check (observed_contamination_pct between 0 and 100),
  notes text not null default '',
  photo_media_ids text[] not null default '{}',
  checked_at timestamptz not null,
  recorded_by text not null references profiles (id)
);

create table assurance_claims (
  id text primary key,
  transaction_id text not null references transactions (id) on delete cascade,
  lot_id text not null references lots (id),
  buyer_id text not null references profiles (id),
  seller_id text not null references profiles (id),
  type claim_type not null,
  expected text not null,
  observed_value numeric(12, 3) not null,
  observed text not null,
  explanation text not null,
  requested_remedy remedy_kind not null,
  media_ids text[] not null default '{}',
  status claim_status not null,
  seller_decision text check (seller_decision in ('accept', 'dispute')),
  seller_explanation text,
  seller_media_ids text[],
  seller_responded_at timestamptz,
  seller_responded_by text references profiles (id),
  ops_outcome ops_outcome,
  ops_reason text,
  ops_amount bigint,
  ops_decided_at timestamptz,
  ops_decided_by text references profiles (id),
  opened_at timestamptz not null,
  resolved_at timestamptz,
  -- Every Operations decision records who, why and when.
  constraint claims_ops_decision_complete check (
    ops_outcome is null or (length(trim(ops_reason)) >= 10 and ops_decided_at is not null and ops_decided_by is not null)
  )
);
create unique index claims_one_open_per_tx on assurance_claims (transaction_id) where status in ('open', 'seller_responded', 'under_review');

create table notifications (
  id text primary key,
  user_id text not null references profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  href text not null,
  read boolean not null default false,
  at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, at desc);

create table audit_log (
  id text primary key,
  entity text not null,
  entity_id text not null,
  action text not null,
  actor_id text not null,
  actor_role text not null,
  from_status text,
  to_status text,
  reason text,
  at timestamptz not null default now()
);
create index audit_entity_idx on audit_log (entity_id, at);

-- Ids for records created after a reset (TX-2000 …); see packages/domain NEW_ID_START.
create table id_counters (
  prefix text primary key,
  next integer not null
);

create table app_meta (
  key text primary key,
  value jsonb not null
);

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'profiles', 'lots', 'bids', 'emd_records', 'transactions', 'media', 'weighbridge_measurements',
    'condition_checks', 'assurance_claims', 'notifications', 'audit_log', 'id_counters', 'app_meta'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Evidence files (listing photos, lifting photos, weighbridge tickets). Public read: demo data only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lot-media', 'lot-media', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf']
)
on conflict (id) do nothing;
