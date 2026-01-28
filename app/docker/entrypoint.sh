#!/bin/sh
set -e

./docker/wait-port.sh mongo 27017
./docker/wait-port.sh localstack 4566

if [ -n "${AWS_ENDPOINT_URL:-}" ]; then
  echo "[prestart] bootstrapping localstack resources..."

  if [ -f "/srv/dist/scripts/bootstrap-localstack.js" ]; then
    node /srv/dist/scripts/bootstrap-localstack.js
  else
    node -r ts-node/register /srv/src/scripts/bootstrap-localstack.ts
  fi

  echo "[prestart] localstack bootstrap done"
fi

echo "[prestart] starting Nest..."
exec sh -lc "${START_CMD:-node dist/main.js}"
