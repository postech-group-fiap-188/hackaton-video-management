#!/usr/bin/env bash
set -e

echo "[localstack] creating s3 buckets..."
awslocal s3 mb s3://videos-input || true
awslocal s3 mb s3://videos-processed || true

echo "[localstack] creating s3 buckets..."
awslocal sqs create-queue --queue-name video-processing-queue || true
awslocal sqs create-queue --queue-name video-status-queue || true

echo "[localstack] done."