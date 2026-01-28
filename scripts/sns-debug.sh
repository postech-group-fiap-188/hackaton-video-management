#!/usr/bin/env bash
# Tornar executável
# chmod +x app/scripts/sns-debug.sh

# Setup (cria topic/fila/subscription/policy)
# cd app
# ./scripts/sns-debug.sh setup

set -euo pipefail

# ========= CONFIG =========
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-000000000000}"


TOPIC_NAME="${SNS_TOPIC_NAME:-video-processing-topic}"
DEBUG_QUEUE_NAME="${SQS_DEBUG_QUEUE_NAME:-video-processing-debug-queue}"

ENDPOINT_URL="${AWS_ENDPOINT_URL:-}"

# ========= HELPERS =========
if command -v awslocal >/dev/null 2>&1; then
  AWS="awslocal"
else
  AWS="aws"
fi

aws_cmd() {
  if [[ -n "$ENDPOINT_URL" && "$AWS" == "aws" ]]; then
    aws --endpoint-url "$ENDPOINT_URL" "$@"
  else
    $AWS "$@"
  fi
}

echo "[sns-debug] region=$REGION account=$ACCOUNT_ID topic=$TOPIC_NAME queue=$DEBUG_QUEUE_NAME"

TOPIC_ARN="arn:aws:sns:${REGION}:${ACCOUNT_ID}:${TOPIC_NAME}"

# ========= 1) Create topic (idempotent) =========
echo "[sns-debug] ensuring SNS topic exists..."
aws_cmd sns create-topic --name "$TOPIC_NAME" >/dev/null

# ========= 2) Create queue (idempotent) =========
echo "[sns-debug] ensuring SQS debug queue exists..."
aws_cmd sqs create-queue --queue-name "$DEBUG_QUEUE_NAME" >/dev/null

DEBUG_QUEUE_URL="$(aws_cmd sqs get-queue-url --queue-name "$DEBUG_QUEUE_NAME" --query 'QueueUrl' --output text)"
DEBUG_QUEUE_ARN="$(aws_cmd sqs get-queue-attributes \
  --queue-url "$DEBUG_QUEUE_URL" \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)"

echo "[sns-debug] topic_arn=$TOPIC_ARN"
echo "[sns-debug] queue_url=$DEBUG_QUEUE_URL"
echo "[sns-debug] queue_arn=$DEBUG_QUEUE_ARN"

# ========= 3) Subscribe topic -> queue (idempotent-ish) =========
echo "[sns-debug] subscribing queue to topic (if not already)..."

SUB_ARN="$(aws_cmd sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" \
  --query "Subscriptions[?Endpoint=='$DEBUG_QUEUE_ARN' && Protocol=='sqs'].SubscriptionArn | [0]" \
  --output text 2>/dev/null || true)"

if [[ -z "$SUB_ARN" || "$SUB_ARN" == "None" ]]; then
  SUB_ARN="$(aws_cmd sns subscribe \
    --topic-arn "$TOPIC_ARN" \
    --protocol sqs \
    --notification-endpoint "$DEBUG_QUEUE_ARN" \
    --query 'SubscriptionArn' \
    --output text)"
  echo "[sns-debug] created subscription=$SUB_ARN"
else
  echo "[sns-debug] subscription already exists: $SUB_ARN"
fi

# ========= 4) Set queue policy to allow SNS publish =========
echo "[sns-debug] setting SQS policy to allow topic publish..."
POLICY=$(cat <<EOF
{
  "Version":"2012-10-17",
  "Statement":[
    {
      "Sid":"Allow-SNS-SendMessage",
      "Effect":"Allow",
      "Principal":"*",
      "Action":"sqs:SendMessage",
      "Resource":"$DEBUG_QUEUE_ARN",
      "Condition":{
        "ArnEquals":{"aws:SourceArn":"$TOPIC_ARN"}
      }
    }
  ]
}
EOF
)

aws_cmd sqs set-queue-attributes \
  --queue-url "$DEBUG_QUEUE_URL" \
  --attributes Policy="$POLICY" >/dev/null

echo "[sns-debug] done setup ✅"
