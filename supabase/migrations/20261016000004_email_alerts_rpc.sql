-- The email-alerts function reaches the queue over HTTPS (PostgREST, service role) instead of a direct database
-- connection, which the hosted Edge Function couldn't open (D-101).

create or replace function claim_email_alerts(batch int default 20, max_attempts int default 5)
returns table (alert_id text, title text, body text, href text, email text, name text)
language sql security definer set search_path = public as $$
  update notifications n
     set emailed_at = now(), email_attempts = n.email_attempts + 1
    from profiles p
   where n.id in (
           select q.id from notifications q
            where q.emailed_at is null and q.kind = 'eligibility_submitted' and q.email_attempts < max_attempts
            order by q.at limit batch
            for update skip locked)
     and p.id = n.user_id
  returning n.id, n.title, n.body, n.href, p.email, p.name;
$$;

create or replace function release_email_alerts(ids text[]) returns void
language sql security definer set search_path = public as $$
  update notifications set emailed_at = null where id = any (ids);
$$;

revoke all on function claim_email_alerts, release_email_alerts from public, anon, authenticated;
grant execute on function claim_email_alerts, release_email_alerts to service_role;
