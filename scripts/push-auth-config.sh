#!/usr/bin/env bash
# Push supabase/config.toml [remotes.production] to the live project, with the SMTP secret read from the
# gitignored supabase/.env.smtp (SUPABASE_AUTH_SMTP_USER, SUPABASE_AUTH_SMTP_PASS). Shows the diff first. (D-099, D-100)
set -euo pipefail
cd "$(dirname "$0")/.."
REF=qainjxytjilrgajndogv
ENV_FILE=supabase/.env.smtp
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE — run scripts/set-smtp-password.sh first." >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a
: "${SUPABASE_AUTH_SMTP_USER:?not set in $ENV_FILE}"
: "${SUPABASE_AUTH_SMTP_PASS:?not set in $ENV_FILE}"
echo "Changes to push (passwords hidden):"
supabase config diff --project-ref "$REF" 2>/dev/null | grep '^{' | python3 -c '
import json,sys
for c in json.load(sys.stdin)["changes"]:
    p=".".join(c["path"]); hide=("pass" in p)
    old="<hidden>" if hide else c.get("remote"); new="<hidden>" if hide else c.get("local")
    print("  %s: %s -> %s" % (p, old, new))'
[ "${1:-}" = "--yes" ] || { read -r -p "Push these to the live project? [y/N] " a; [ "$a" = y ] || exit 1; }
supabase config push --project-ref "$REF" --yes
