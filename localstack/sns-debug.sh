#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
TOPIC_NAME="${SNS_TOPIC_NAME:-video-events}"
DEBUG_QUEUE_NAME="${SQS_DEBUG_QUEUE_NAME:-video-processing-debug-queue}"

AWS="awslocal"

echo "[sns-debug] region=$REGION topic=$TOPIC_NAME debugQueue=$DEBUG_QUEUE_NAME"

echo "[sns-debug] ensuring topic exists..."
TOPIC_ARN="$($AWS sns create-topic --name "$TOPIC_NAME" --query 'TopicArn' --output text)"
echo "[sns-debug] topic_arn=$TOPIC_ARN"

echo "[sns-debug] ensuring DEBUG queue exists..."
$AWS sqs create-queue --queue-name "$DEBUG_QUEUE_NAME" >/dev/null

DEBUG_QUEUE_URL="$($AWS sqs get-queue-url --queue-name "$DEBUG_QUEUE_NAME" --query 'QueueUrl' --output text)"
DEBUG_QUEUE_ARN="$($AWS sqs get-queue-attributes \
  --queue-url "$DEBUG_QUEUE_URL" \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)"

echo "[sns-debug] debug_queue_url=$DEBUG_QUEUE_URL"
echo "[sns-debug] debug_queue_arn=$DEBUG_QUEUE_ARN"

echo "[sns-debug] subscribing topic -> DEBUG queue (idempotent)..."
SUB_ARN="$($AWS sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" \
  --query "Subscriptions[?Endpoint=='$DEBUG_QUEUE_ARN' && Protocol=='sqs'].SubscriptionArn | [0]" \
  --output text 2>/dev/null || echo "")"

if [[ -z "$SUB_ARN" || "$SUB_ARN" == "None" ]]; then
  SUB_ARN="$($AWS sns subscribe \
    --topic-arn "$TOPIC_ARN" \
    --protocol sqs \
    --notification-endpoint "$DEBUG_QUEUE_ARN" \
    --query 'SubscriptionArn' \
    --output text)"
  echo "[sns-debug] created subscription=$SUB_ARN"
else
  echo "[sns-debug] subscription already exists: $SUB_ARN"
fi

echo "[sns-debug] setting DEBUG queue policy to allow SNS publish..."


POLICY_RAW=$(cat <<EOF
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

ATTR_JSON="$(python3 - <<PY
import json
policy = """$POLICY_RAW"""
print(json.dumps({"Policy": policy}))
PY
)"

$AWS sqs set-queue-attributes \
  --queue-url "$DEBUG_QUEUE_URL" \
  --attributes "$ATTR_JSON" >/dev/null

echo "[sns-debug] done"
