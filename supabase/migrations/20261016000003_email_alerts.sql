-- Email alerts (D-101): some in-app notifications are also emailed. Today only reviewers' "new application"
-- alerts (kind eligibility_submitted). The email-alerts Edge Function drains them; Render's free plan can't send email.
--
-- Delivery: a row trigger asks the function (via pg_net) to drain the queue as soon as an alert is inserted, and
-- pg_cron asks again every 10 minutes in case that call was lost. The function trusts nothing in the request —
-- it only sends what is queued here — so its URL needs no secret.

alter table notifications add column emailed_at timestamptz;
alter table notifications add column email_attempts int not null default 0;

-- Nothing that existed before this migration is emailed.
update notifications set emailed_at = at where kind = 'eligibility_submitted';

create index notifications_email_queue on notifications (at) where emailed_at is null and kind = 'eligibility_submitted';

-- Per-environment settings that aren't secrets. email_alerts_url is set by scripts/deploy-email-alerts.sh (live) or the
-- e2e setup (local); while it's unset, alerts simply queue.
create table if not exists app_settings (
  key text primary key,
  value text not null
);
alter table app_settings enable row level security;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function kick_email_alerts() returns void
language plpgsql security definer set search_path = public as $$
declare
  target text;
begin
  select value into target from app_settings where key = 'email_alerts_url';
  if target is not null and exists (select 1 from notifications where emailed_at is null and kind = 'eligibility_submitted') then
    perform net.http_post(url := target, body := '{}'::jsonb, timeout_milliseconds := 10000);
  end if;
end $$;

create or replace function notifications_email_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform kick_email_alerts();
  return null;
end $$;

create trigger notifications_email_alert after insert on notifications
  for each row when (new.kind = 'eligibility_submitted') execute function notifications_email_alert();

select cron.schedule('email-alerts', '*/10 * * * *', 'select public.kick_email_alerts()');

revoke all on function kick_email_alerts, notifications_email_alert from public, anon, authenticated;
