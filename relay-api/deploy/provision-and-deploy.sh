#!/usr/bin/env bash
# shellcheck disable=SC2016
# Provision Postgres + deploy oneliferelay-api on OCI A1.
# Run ON the server as ubuntu. Does not print secret values.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/api-platform/apps/oneliferelay}"
SECRETS_DIR="${SECRETS_DIR:-$APP_DIR/secrets}"
IMAGE_TAG="${IMAGE_TAG:-oneliferelay-api:$(date -u +%Y%m%d%H%M%S)}"
HOST_PORT="${HOST_PORT:-8798}"
SOURCE_DIR="${SOURCE_DIR:-$APP_DIR/source}"
API_DIR="${API_DIR:-$SOURCE_DIR/relay-api}"

mkdir -p "$APP_DIR" "$SECRETS_DIR" "$SOURCE_DIR"
chmod 750 "$APP_DIR"
chmod 700 "$SECRETS_DIR"

if [[ ! -d "$API_DIR" ]]; then
  echo "missing source at $API_DIR" >&2
  exit 1
fi

if [[ ! -f "$SECRETS_DIR/db-app-password" ]]; then
  openssl rand -base64 24 | tr -d '\n' >"$SECRETS_DIR/db-app-password"
  chmod 600 "$SECRETS_DIR/db-app-password"
fi
if [[ ! -f "$SECRETS_DIR/db-owner-password" ]]; then
  openssl rand -base64 24 | tr -d '\n' >"$SECRETS_DIR/db-owner-password"
  chmod 600 "$SECRETS_DIR/db-owner-password"
fi
if [[ ! -f "$SECRETS_DIR/session-signing-secret" ]]; then
  openssl rand -base64 48 | tr -d '\n' >"$SECRETS_DIR/session-signing-secret"
  chmod 600 "$SECRETS_DIR/session-signing-secret"
fi

APP_PW="$(cat "$SECRETS_DIR/db-app-password")"
OWNER_PW="$(cat "$SECRETS_DIR/db-owner-password")"
SESSION_SIGNING_SECRET="$(cat "$SECRETS_DIR/session-signing-secret")"
PG_SUPER_PW="$(sudo cat /srv/api-platform/compose/postgres/secrets/postgres_password)"
PG_SUPER_USER="${PG_SUPER_USER:-platform_admin}"
APP_PW_ENC="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$APP_PW")"
OWNER_PW_ENC="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$OWNER_PW")"

echo "Ensuring database and roles…"
EXISTS="$(sudo docker exec -e PGPASSWORD="$PG_SUPER_PW" api-platform-postgres \
  psql -U "$PG_SUPER_USER" -d platform -tAc "SELECT 1 FROM pg_database WHERE datname='oneliferelay'" | tr -d '[:space:]')"
if [[ "$EXISTS" != "1" ]]; then
  sudo docker exec -e PGPASSWORD="$PG_SUPER_PW" api-platform-postgres \
    psql -U "$PG_SUPER_USER" -d platform -v ON_ERROR_STOP=1 -c "CREATE DATABASE oneliferelay"
fi

sudo docker exec \
  -e PGPASSWORD="$PG_SUPER_PW" \
  -e OWNER_PW="$OWNER_PW" \
  -e APP_PW="$APP_PW" \
  api-platform-postgres \
  sh -c 'psql -U platform_admin -d platform -v ON_ERROR_STOP=1 \
    -c "DO \$\$ BEGIN EXECUTE format('\''CREATE ROLE oneliferelay_owner LOGIN PASSWORD %L'\'', '\''$OWNER_PW'\''); EXCEPTION WHEN duplicate_object THEN EXECUTE format('\''ALTER ROLE oneliferelay_owner PASSWORD %L'\'', '\''$OWNER_PW'\''); END \$\$;" \
    -c "DO \$\$ BEGIN EXECUTE format('\''CREATE ROLE oneliferelay_app LOGIN PASSWORD %L'\'', '\''$APP_PW'\''); EXCEPTION WHEN duplicate_object THEN EXECUTE format('\''ALTER ROLE oneliferelay_app PASSWORD %L'\'', '\''$APP_PW'\''); END \$\$;" \
    -c "GRANT CONNECT ON DATABASE oneliferelay TO oneliferelay_owner, oneliferelay_app;"'

sudo docker exec -e PGPASSWORD="$PG_SUPER_PW" api-platform-postgres \
  psql -U "$PG_SUPER_USER" -d oneliferelay -v ON_ERROR_STOP=1 \
  -c "ALTER SCHEMA public OWNER TO oneliferelay_owner;" \
  -c "GRANT ALL ON SCHEMA public TO oneliferelay_owner;" \
  -c "GRANT CREATE ON SCHEMA public TO oneliferelay_owner;" \
  -c "GRANT USAGE ON SCHEMA public TO oneliferelay_app;"

MIGRATIONS_DIR="$API_DIR/migrations"
echo "Applying all migrations as owner…"
sudo docker run --rm --network postgres_platform_db \
  -e PGPASSWORD="$OWNER_PW" \
  -v "$MIGRATIONS_DIR:/migrations:ro" \
  postgres:16-alpine \
  sh -c 'for migration in /migrations/*.sql; do echo "Applying $(basename "$migration")"; psql -h postgres -U oneliferelay_owner -d oneliferelay -v ON_ERROR_STOP=1 -f "$migration"; done'

echo "Granting app table privileges…"
sudo docker run --rm --network postgres_platform_db \
  -e PGPASSWORD="$OWNER_PW" \
  postgres:16-alpine \
  psql -h postgres -U oneliferelay_owner -d oneliferelay -v ON_ERROR_STOP=1 -c \
  "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oneliferelay_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO oneliferelay_app; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oneliferelay_app;"

umask 077
{
  printf "NODE_ENV=production\n"
  printf "PORT=%s\n" "$HOST_PORT"
  printf "HOST=0.0.0.0\n"
  printf "DATABASE_URL=postgresql://oneliferelay_app:%s@postgres:5432/oneliferelay\n" "$APP_PW_ENC"
  printf "SESSION_SIGNING_SECRET=%s\n" "$SESSION_SIGNING_SECRET"
  printf "CORS_ORIGIN=https://relay.collinworks.dev,https://jungcollin.github.io,http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:4175,http://localhost:4175\n"
} >"$SECRETS_DIR/runtime.env"
chmod 600 "$SECRETS_DIR/runtime.env"
{
  printf "NODE_ENV=production\n"
  printf "DATABASE_URL=postgresql://oneliferelay_owner:%s@postgres:5432/oneliferelay\n" "$OWNER_PW_ENC"
} >"$SECRETS_DIR/owner.env"
chmod 600 "$SECRETS_DIR/owner.env"
echo "wrote env files under $SECRETS_DIR (values not printed)"

echo "Building $IMAGE_TAG …"
sudo docker build -f "$API_DIR/Dockerfile" -t "$IMAGE_TAG" -t oneliferelay-api:latest "$API_DIR"
sudo docker build -f "$API_DIR/Dockerfile" --target migrations -t oneliferelay-migrations:latest "$API_DIR"

if sudo docker network inspect oneliferelay_edge >/dev/null 2>&1; then
  if ! sudo docker network inspect oneliferelay_edge --format "{{index .Labels \"com.docker.compose.network\"}}" | grep -q .; then
    sudo docker network rm oneliferelay_edge 2>/dev/null || true
  fi
fi
sudo env \
  ONELIFERELAY_API_IMAGE="$IMAGE_TAG" \
  ONELIFERELAY_MIGRATIONS_IMAGE=oneliferelay-migrations:latest \
  ONELIFERELAY_ENV_FILE="$SECRETS_DIR/runtime.env" \
  ONELIFERELAY_OWNER_ENV_FILE="$SECRETS_DIR/owner.env" \
  docker compose -f "$API_DIR/deploy/compose.yaml" up -d --force-recreate oneliferelay-api

echo "Waiting for health on :$HOST_PORT …"
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${HOST_PORT}/v1/health" >/dev/null 2>&1; then
    echo "health ok"
    curl -fsS "http://127.0.0.1:${HOST_PORT}/v1/ready"; echo
    echo "DEPLOY_OK port=${HOST_PORT} image=${IMAGE_TAG}"
    exit 0
  fi
  sleep 2
done
echo "health timeout" >&2
sudo docker ps -a --filter name=oneliferelay | head
sudo docker logs --tail 100 "$(sudo docker ps -aqf name=oneliferelay-api | head -1)" || true
exit 1
