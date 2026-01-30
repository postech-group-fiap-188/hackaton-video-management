#!/bin/sh
set -e

cd /srv/app

./docker/wait-port.sh mongo 27017
./docker/wait-port.sh localstack 4566

if [ -n "${AWS_ENDPOINT_URL:-}" ]; then
  echo "[prestart] bootstrapping localstack resources..."

  if [ -f "/srv/app/dist/scripts/bootstrap-localstack.js" ]; then
    node /srv/app/dist/scripts/bootstrap-localstack.js
  elif [ -f "/srv/app/scripts/bootstrap-localstack.ts" ]; then
    node -r ts-node/register /srv/app/scripts/bootstrap-localstack.ts
  elif [ -f "/srv/app/src/scripts/bootstrap-localstack.ts" ]; then
    node -r ts-node/register /srv/app/src/scripts/bootstrap-localstack.ts
  else
    echo "[prestart] bootstrap script not found in dist/scripts, scripts, or src/scripts" >&2
    ls -la /srv/app/dist/scripts 2>/dev/null || true
    ls -la /srv/app/scripts 2>/dev/null || true
    ls -la /srv/app/src/scripts 2>/dev/null || true
    exit 1
  fi

  echo "[prestart] localstack bootstrap done"
fi

echo "[prestart] starting Nest..."
exec sh -lc "${START_CMD:-node dist/main.js}"
