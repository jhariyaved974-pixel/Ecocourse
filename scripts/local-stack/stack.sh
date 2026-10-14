#!/usr/bin/env bash
# Local Supabase-compatible stack for development and automated tests when
# Docker (and therefore `supabase start`) is unavailable.
#
#   Postgres 16 (:54322) + GoTrue (:54331) + PostgREST (:54330) + gateway (:54321)
#
# Usage:
#   scripts/local-stack/stack.sh up        # start everything (idempotent)
#   scripts/local-stack/stack.sh reset     # drop & recreate the database, re-apply migrations + seed
#   scripts/local-stack/stack.sh down      # stop services
#
# Requires: PostgreSQL 16 server binaries, and the GoTrue + PostgREST release
# binaries (downloaded by `stack.sh fetch`). Uses the well-known local-only JWT
# secret from the Supabase CLI. NEVER use these keys anywhere else.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK_DIR="${STACK_DIR:-/tmp/pgstack}"
BIN_DIR="${BIN_DIR:-$STACK_DIR/bin}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PG_USER="${PG_USER:-postgres}"
export JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
DB_URL="postgres://postgres@127.0.0.1:54322/postgres"

run_pg() {
  if [ "$(id -u)" = "0" ]; then su "$PG_USER" -s /bin/bash -c "$*"; else bash -c "$*"; fi
}

fetch() {
  mkdir -p "$BIN_DIR"
  if [ ! -x "$BIN_DIR/postgrest" ]; then
    curl -sSL -o "$BIN_DIR/postgrest.tar.xz" https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
    tar -xf "$BIN_DIR/postgrest.tar.xz" -C "$BIN_DIR"
  fi
  if [ ! -x "$BIN_DIR/auth/auth" ]; then
    mkdir -p "$BIN_DIR/auth"
    curl -sSL -o "$BIN_DIR/auth.tar.gz" https://github.com/supabase/auth/releases/download/v2.177.0/auth-v2.177.0-x86.tar.gz
    tar -xzf "$BIN_DIR/auth.tar.gz" -C "$BIN_DIR/auth"
  fi
}

pg_up() {
  mkdir -p "$STACK_DIR"
  [ "$(id -u)" = "0" ] && chown "$PG_USER" "$STACK_DIR"
  if [ ! -d "$STACK_DIR/pgdata" ]; then
    run_pg "$PG_BIN/initdb -D $STACK_DIR/pgdata -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null"
    run_pg "printf \"port=54322\nlisten_addresses='127.0.0.1'\nmax_connections=300\nunix_socket_directories='$STACK_DIR'\nlog_min_messages=warning\n\" >> $STACK_DIR/pgdata/postgresql.conf"
  fi
  if ! run_pg "$PG_BIN/pg_ctl -D $STACK_DIR/pgdata status" >/dev/null 2>&1; then
    run_pg "$PG_BIN/pg_ctl -D $STACK_DIR/pgdata -l $STACK_DIR/pg.log start" >/dev/null
    sleep 1
  fi
}

db_init() {
  local db_exists
  db_exists=$(psql "$DB_URL" -tAc "select 1 from pg_namespace where nspname='storage'" || true)
  if [ "$db_exists" != "1" ]; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/local-stack/bootstrap.sql"
  fi
}

auth_up() {
  if curl -s -o /dev/null http://127.0.0.1:54331/health; then return; fi
  (
    cd "$BIN_DIR/auth"
    GOTRUE_API_HOST=127.0.0.1 PORT=54331 API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 \
    GOTRUE_DB_DRIVER=postgres \
    GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:54322/postgres" \
    GOTRUE_SITE_URL=http://localhost:3000 GOTRUE_URI_ALLOW_LIST='**' \
    GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true \
    GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
    GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
    GOTRUE_MFA_TOTP_ENROLL_ENABLED=true GOTRUE_MFA_TOTP_VERIFY_ENABLED=true \
    GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 GOTRUE_RATE_LIMIT_VERIFY=10000 GOTRUE_RATE_LIMIT_EMAIL_SENT=10000 \
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true GOTRUE_LOG_LEVEL=warn \
    nohup ./auth > "$STACK_DIR/auth.log" 2>&1 &
  )
  for _ in $(seq 1 40); do
    curl -s -o /dev/null http://127.0.0.1:54331/health && return
    sleep 0.5
  done
  echo "GoTrue failed to start; see $STACK_DIR/auth.log" >&2
  exit 1
}

migrate() {
  psql "$DB_URL" -q -c "create table if not exists public._local_migrations (name text primary key, applied_at timestamptz default now())" >/dev/null
  for f in "$ROOT"/supabase/migrations/*.sql; do
    name=$(basename "$f")
    applied=$(psql "$DB_URL" -tAc "select 1 from public._local_migrations where name = '$name'")
    if [ "$applied" != "1" ]; then
      echo "  applying $name"
      psql "$DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f "$f"
      psql "$DB_URL" -q -c "insert into public._local_migrations(name) values ('$name')" >/dev/null
    fi
  done
  psql "$DB_URL" -q -c "revoke all on public._local_migrations from anon, authenticated" >/dev/null
}

seed() {
  if [ -f "$ROOT/supabase/seed.sql" ]; then
    echo "  seeding"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f "$ROOT/supabase/seed.sql"
  fi
}

rest_up() {
  pkill -f "postgrest $STACK_DIR/postgrest.conf" 2>/dev/null && sleep 1 || true
  cat > "$STACK_DIR/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:postgres@127.0.0.1:54322/postgres"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
db-pool = 20
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 54330
log-level = "warn"
CONF
  nohup "$BIN_DIR/postgrest" "$STACK_DIR/postgrest.conf" > "$STACK_DIR/postgrest.log" 2>&1 &
  for _ in $(seq 1 40); do
    curl -s -o /dev/null http://127.0.0.1:54330/ && return
    sleep 0.25
  done
  echo "PostgREST failed to start; see $STACK_DIR/postgrest.log" >&2
  exit 1
}

gateway_up() {
  pkill -f "scripts/local-stack/gateway.mjs" 2>/dev/null && sleep 0.5 || true
  mkdir -p "$STACK_DIR/storage"
  JWT_SECRET="$JWT_SECRET" STORAGE_DIR="$STACK_DIR/storage" \
    nohup node "$ROOT/scripts/local-stack/gateway.mjs" > "$STACK_DIR/gateway.log" 2>&1 &
  for _ in $(seq 1 40); do
    curl -s -o /dev/null http://127.0.0.1:54321/rest/v1/ && return
    sleep 0.25
  done
  echo "Gateway failed to start; see $STACK_DIR/gateway.log" >&2
  exit 1
}

down() {
  pkill -f "scripts/local-stack/gateway.mjs" 2>/dev/null || true
  pkill -f "postgrest $STACK_DIR/postgrest.conf" 2>/dev/null || true
  pkill -f "$BIN_DIR/auth/auth" 2>/dev/null || pkill -x auth 2>/dev/null || true
}

case "${1:-up}" in
  fetch) fetch ;;
  up)
    fetch; pg_up; db_init; auth_up; migrate; rest_up; gateway_up
    echo "Local stack ready: SUPABASE_URL=http://127.0.0.1:54321"
    ;;
  migrate) migrate; rest_up ;;
  seed) seed ;;
  reset)
    down
    pg_up
    psql "postgres://postgres@127.0.0.1:54322/template1" -q -c "drop database if exists postgres with (force)" -c "create database postgres"
    rm -rf "$STACK_DIR/storage"
    db_init; auth_up; migrate; seed; rest_up; gateway_up
    echo "Local stack reset: SUPABASE_URL=http://127.0.0.1:54321"
    ;;
  down) down ;;
  *) echo "usage: $0 {fetch|up|migrate|seed|reset|down}" >&2; exit 2 ;;
esac
