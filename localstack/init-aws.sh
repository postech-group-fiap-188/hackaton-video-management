#!/usr/bin/env bash
set -Eeuo pipefail

log() { echo "[localstack:init] $*"; }

trap 'log "ERROR at line $LINENO: $BASH_COMMAND"' ERR

log "bootstrapping resources..."

log "creating s3 buckets..."
awslocal s3 mb s3://videos-input >/dev/null 2>&1 || true
awslocal s3 mb s3://videos-processed >/dev/null 2>&1 || true

log "creating sns topic..."
awslocal sns create-topic --name video-processing-topic >/dev/null 2>&1 || true

log "creating app status queue"
awslocal sqs create-queue --queue-name video-status-queue >/dev/null 2>&1 || true

log "running sns-debug.sh"
if [ -f "/etc/localstack/init/ready.d/sns-debug.sh" ]; then
  if ! bash /etc/localstack/init/ready.d/sns-debug.sh; then
    log "WARN: sns-debug.sh failed, continuing anyway"
  fi
else
  log "WARN: sns-debug.sh not found, skipping"
fi

log "done"
exit 0
