#!/usr/bin/env bash
# Starts a throwaway local PostgreSQL 16 for development and tests (no Docker needed).
#   bash scripts/local-postgres.sh        # start (idempotent), creates `agency` and `agency_test` databases
#   bash scripts/local-postgres.sh stop
# Data lives in $AGENCY_PG_DIR (default /tmp/agency-pg). Local-only, trust auth on 127.0.0.1.
set -euo pipefail
PG_DIR="${AGENCY_PG_DIR:-/tmp/agency-pg}"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${AGENCY_PG_PORT:-54400}"
run() { if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }

if [ "${1:-start}" = "stop" ]; then run "$PG_BIN/pg_ctl -D $PG_DIR/data stop -m fast" || true; exit 0; fi

mkdir -p "$PG_DIR"; [ "$(id -u)" = "0" ] && chown postgres "$PG_DIR"
if [ ! -d "$PG_DIR/data" ]; then
  run "$PG_BIN/initdb -D $PG_DIR/data -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null"
  run "printf \"port=$PORT\nlisten_addresses='127.0.0.1'\nunix_socket_directories='$PG_DIR'\n\" >> $PG_DIR/data/postgresql.conf"
fi
if ! run "$PG_BIN/pg_ctl -D $PG_DIR/data status" >/dev/null 2>&1; then
  run "$PG_BIN/pg_ctl -D $PG_DIR/data -l $PG_DIR/pg.log -w start" >/dev/null
fi
for db in agency agency_test; do
  psql "postgres://postgres@127.0.0.1:$PORT/postgres" -tAc "select 1 from pg_database where datname='$db'" | grep -q 1 \
    || psql "postgres://postgres@127.0.0.1:$PORT/postgres" -qc "create database $db"
done
echo "PostgreSQL ready: postgres://postgres@127.0.0.1:$PORT/agency (tests: agency_test)"
