import {
  SQSClient,
  CreateQueueCommand,
  GetQueueUrlCommand,
} from '@aws-sdk/client-sqs';
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function ensureQueue(
  client: SQSClient,
  queueName: string,
): Promise<void> {
  try {
    await client.send(new GetQueueUrlCommand({ QueueName: queueName }));
    return;
  } catch {
    await client.send(new CreateQueueCommand({ QueueName: queueName }));
  }
}

async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

async function main(): Promise<void> {
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const endpoint = must('AWS_ENDPOINT_URL');

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? 'test';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? 'test';

  const sqs = new SQSClient({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const s3 = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  await ensureQueue(sqs, 'video-processing-queue');
  await ensureQueue(sqs, 'video-status-queue');
  await ensureBucket(s3, must('S3_INPUT_BUCKET_NAME'));
  await ensureBucket(s3, must('S3_OUTPUT_BUCKET_NAME'));
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);

  console.error(`[prestart] bootstrap failed: ${msg}`);
  process.exit(1);
});
