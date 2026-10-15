-- Phase 1 MVP (docs/PHASE1_MVP.md): real sign-in, eligibility review, offline payments, private documents.
-- Additive only: new enum values, nullable/defaulted columns, new indexes and a new table. No row is changed.

-- ── Enums (new values are only used by later statements/migrations, never in this transaction) ──
alter type verification_status add value if not exists 'incomplete';
alter type verification_status add value if not exists 'pending_review';
alter type verification_status add value if not exists 'approved';
alter type verification_status add value if not exists 'needs_info';
alter type verification_status add value if not exists 'rejected';

alter type emd_status add value if not exists 'submitted';
alter type emd_status add value if not exists 'confirmed';
alter type emd_status add value if not exists 'rejected';
alter type emd_status add value if not exists 'refund_due';

-- ── Accounts: one profile per Supabase Auth user; phone unique; legal identifiers unique across roles ──
alter table profiles add column if not exists auth_user_id uuid references auth.users (id) on delete set null;
alter table profiles add column if not exists phone text;
create unique index if not exists profiles_auth_user_key on profiles (auth_user_id) where auth_user_id is not null;
create unique index if not exists profiles_phone_key on profiles (phone) where phone is not null;

-- The eligibility application (entity type, PAN, GSTIN, representative, seller declaration, bank details,
-- review and history) as one document. PAN/GSTIN uniqueness: see 20261016000002 (needs the new enum values).
alter table companies add column if not exists eligibility jsonb;

-- ── Private files: eligibility documents and payment receipts ──
create table if not exists account_documents (
  id text primary key,
  company_id text not null references companies (id) on delete cascade,
  kind text not null check (kind in (
    'pan_card', 'gst_certificate', 'constitution', 'address_proof', 'representative_id',
    'authorisation_letter', 'premises_proof', 'cancelled_cheque', 'payment_receipt'
  )),
  file_name text not null,
  content_type text not null,
  size integer not null check (size >= 0),
  -- Path inside the private bucket. Never a public URL; the API hands out short-lived signed links.
  path text not null default '',
  uploaded_at timestamptz not null default now(),
  uploaded_by text not null references profiles (id)
);
create index if not exists account_documents_company_idx on account_documents (company_id);
alter table account_documents enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-documents', 'account-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ── Offline payments: what the payer reported, the receiver's decision, the refund, and every event ──
alter table emd_records drop constraint if exists emd_records_mode_check;
alter table emd_records add constraint emd_records_mode_check check (mode in ('simulated', 'manual'));
alter table emd_records add column if not exists payment jsonb;
alter table emd_records add column if not exists decision jsonb;
alter table emd_records add column if not exists refund jsonb;
alter table emd_records add column if not exists history jsonb not null default '[]';

alter table transactions add column if not exists balance_payment jsonb;
alter table transactions add column if not exists payment_history jsonb not null default '[]';
alter table transactions add column if not exists refunds jsonb not null default '[]';
