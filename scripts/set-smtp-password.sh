#!/usr/bin/env bash
# Store the Gmail sender and its app password in the gitignored supabase/.env.smtp without echoing it. (D-100)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -t 0 ] || { echo "Run this in your own Terminal window — it needs to ask for the password." >&2; exit 1; }
read -r -p "Gmail address that sends Bid ON email: " user
[[ "$user" == *@*.* && "$user" != *" "* ]] || { echo "That doesn’t look like an email address — nothing saved." >&2; exit 1; }
read -r -s -p "16-character app password (hidden): " pass; echo
pass="${pass// /}"
[ ${#pass} -eq 16 ] || { echo "App passwords are 16 letters; got ${#pass}." >&2; exit 1; }
umask 077
printf 'SUPABASE_AUTH_SMTP_USER=%s\nSUPABASE_AUTH_SMTP_PASS=%s\n' "$user" "$pass" > supabase/.env.smtp
echo "Saved to supabase/.env.smtp (gitignored, readable only by you)."
