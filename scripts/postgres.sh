#!/usr/bin/env bash
#
# Local Postgres for development and integration tests.
#
# Uses the Postgres binaries already on the machine rather than a container, so it
# works in sandboxes and CI images where Docker is unavailable. The cluster lives
# in .pgdata/ and is disposable.
#
# Usage: scripts/postgres.sh {start|stop|status|reset}

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="${PGDATA:-$REPO_ROOT/.pgdata}"
PGPORT="${PGPORT:-5432}"
PGUSER_NAME="${PGUSER_NAME:-nym}"
PGPASSWORD_VALUE="${PGPASSWORD_VALUE:-nym}"
PGDATABASE_NAME="${PGDATABASE_NAME:-nym}"
PGTEST_DATABASE="${PGTEST_DATABASE:-nym_test}"
PGE2E_DATABASE="${PGE2E_DATABASE:-nym_e2e}"

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}"
if [[ -z "$PG_BIN" || ! -x "$PG_BIN/pg_ctl" ]]; then
  echo "Could not find the Postgres server binaries. Set PG_BIN to the directory holding pg_ctl." >&2
  exit 1
fi

# initdb and postgres refuse to run as root, so drop to a normal account when needed.
RUN_AS=()
if [[ "$(id -u)" -eq 0 ]]; then
  if ! id postgres >/dev/null 2>&1; then
    echo "Running as root and no 'postgres' user exists; create one or run this as a non-root user." >&2
    exit 1
  fi
  RUN_AS=(setpriv --reuid=postgres --regid=postgres --clear-groups)
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
fi

run() { "${RUN_AS[@]}" "$@"; }

start() {
  if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
    echo "Initialising cluster in $PGDATA"
    run "$PG_BIN/initdb" -D "$PGDATA" -U "$PGUSER_NAME" --auth=trust >/dev/null
  fi

  if run "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    echo "Postgres already running on :$PGPORT"
  else
    run "$PG_BIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k /tmp" -l "$PGDATA/server.log" -w start
  fi

  for database in "$PGDATABASE_NAME" "$PGTEST_DATABASE" "$PGE2E_DATABASE"; do
    if ! run "$PG_BIN/psql" -h /tmp -p "$PGPORT" -U "$PGUSER_NAME" -lqt postgres \
      | cut -d '|' -f 1 | grep -qw "$database"; then
      run "$PG_BIN/createdb" -h /tmp -p "$PGPORT" -U "$PGUSER_NAME" "$database"
      echo "Created database $database"
    fi
  done

  run "$PG_BIN/psql" -h /tmp -p "$PGPORT" -U "$PGUSER_NAME" -d postgres -c \
    "ALTER USER $PGUSER_NAME WITH PASSWORD '$PGPASSWORD_VALUE';" >/dev/null

  echo "Postgres ready: postgres://$PGUSER_NAME:$PGPASSWORD_VALUE@localhost:$PGPORT/$PGDATABASE_NAME"
}

stop() {
  if run "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    run "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast -w stop
  else
    echo "Postgres is not running."
  fi
}

status() {
  run "$PG_BIN/pg_ctl" -D "$PGDATA" status || true
}

reset() {
  stop || true
  rm -rf "$PGDATA"
  echo "Removed $PGDATA"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  reset) reset ;;
  *)
    echo "Usage: $0 {start|stop|status|reset}" >&2
    exit 1
    ;;
esac
