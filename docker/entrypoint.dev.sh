#!/bin/sh
set -e

cd /srv/app

./docker/wait-port.sh mongo 27017
./docker/wait-port.sh localstack 4566

echo "[prestart] starting Nest (debug/watch)..."
exec ./node_modules/.bin/nest start --watch --debug 0.0.0.0:9229
