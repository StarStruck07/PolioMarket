#!/usr/bin/env bash
# Spin up a throwaway local Postgres, load the auth stub + all migrations,
# and run the Phase 6 dry run. Nothing touches your system Postgres config.
#
# Requires: postgresql@16 (brew install postgresql@16).
# Usage: bash supabase/dryrun/run.sh
set -euo pipefail

export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
export LC_ALL="${LC_ALL:-en_US.UTF-8}" LANG="${LANG:-en_US.UTF-8}"

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGDATA="$(mktemp -d /tmp/pgmkt.XXXX)/data"   # short path so the socket fits
PORT="${PORT:-55432}"
PSQL=(psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres -d market)

cleanup() { pg_ctl -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true; rm -rf "$(dirname "$PGDATA")"; }
trap cleanup EXIT

initdb -D "$PGDATA" -A trust -U postgres >/dev/null
pg_ctl -D "$PGDATA" \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp" \
  -l "$PGDATA/pg.log" start >/dev/null
sleep 2
createdb -h 127.0.0.1 -p "$PORT" -U postgres market

"${PSQL[@]}" -q -f "$REPO/supabase/dryrun/00_auth_stub.sql"
for f in "$REPO"/supabase/migrations/*.sql; do
  echo ">> loading $(basename "$f")"
  "${PSQL[@]}" -q -f "$f"
done

echo ">> running dry run"
"${PSQL[@]}" -f "$REPO/supabase/dryrun/dryrun.sql"
