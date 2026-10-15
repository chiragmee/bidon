#!/usr/bin/env bash
# Roll out reviewer email alerts to the live project (D-101). Run in your own Terminal; it asks before each change.
#   1. apply the pending database migrations (shown first)
#   2. give the email-alerts function the Gmail sender from the gitignored supabase/.env.smtp
#   3. deploy the email-alerts function
#   4. point the database at it
#   5. check the function can log in to Gmail (sends nothing)
set -euo pipefail
cd "$(dirname "$0")/.."
REF=qainjxytjilrgajndogv
SITE=https://auctionit-sand.vercel.app
FN_URL="https://$REF.supabase.co/functions/v1/email-alerts"
ENV_FILE=supabase/.env.smtp
[ -t 0 ] || { echo "Run this in your own Terminal window — it asks before each step." >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE — run scripts/set-smtp-password.sh first." >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a
: "${SUPABASE_AUTH_SMTP_USER:?not set in $ENV_FILE}"
: "${SUPABASE_AUTH_SMTP_PASS:?not set in $ENV_FILE}"

ask() { read -r -p "$1 [y/N] " a; [ "$a" = y ] || { echo "Stopped. Nothing further was changed."; exit 1; }; }

echo "1/5 Database migrations"
supabase db push --linked --dry-run 2>&1 | grep -E "^ •|up to date" || true
ask "Apply these to the live database?"
supabase db push --linked --yes

echo "2/5 Sender for the function (password hidden)"
secrets=$(mktemp); trap 'rm -f "$secrets"' EXIT; chmod 600 "$secrets"
printf 'SMTP_USER=%s\nSMTP_PASS=%s\nSITE_URL=%s\n' "$SUPABASE_AUTH_SMTP_USER" "$SUPABASE_AUTH_SMTP_PASS" "$SITE" > "$secrets"
supabase secrets set --project-ref "$REF" --env-file "$secrets"

echo "3/5 Deploy the email-alerts function"
supabase functions deploy email-alerts --project-ref "$REF" --no-verify-jwt --use-api

echo "4/5 Point the database at the function"
supabase db query --linked "insert into app_settings (key, value) values ('email_alerts_url', '$FN_URL') on conflict (key) do update set value = excluded.value"

echo "5/5 Check the function can log in to Gmail (sends nothing)"
curl -s -m 60 -X POST "$FN_URL?check=1"; echo
echo "Done. New applications now email every reviewer."
