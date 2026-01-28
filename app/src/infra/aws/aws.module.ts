import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SqsModule } from '@ssut/nestjs-sqs';

import { S3StorageAdapter } from './s3/s3-storage.adapter';
import { SqsVideoProcessingAdapter } from './sqs/sqs-video-processing.adapter';

type AwsCreds = { accessKeyId: string; secretAccessKey: string };

@Module({
  imports: [
    ConfigModule,
    SqsModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const region = config.get<string>('AWS_REGION') ?? 'us-east-1';

        const endpoint = config.get<string>('AWS_ENDPOINT_URL') ?? undefined;

        const processingUrl = config.get<string>('SQS_PROCESSING_QUEUE_URL');
        const statusUrl = config.get<string>('SQS_STATUS_QUEUE_URL');
        if (!processingUrl || !statusUrl) {
          throw new Error('Missing SQS urls');
        }

        const accessKeyIdEnv = config.get<string>('AWS_ACCESS_KEY_ID');
        const secretAccessKeyEnv = config.get<string>('AWS_SECRET_ACCESS_KEY');

        let credentials: AwsCreds | undefined;

        if (endpoint) {
          const accessKeyId = accessKeyIdEnv ?? 'test';
          const secretAccessKey = secretAccessKeyEnv ?? 'test';
          credentials = { accessKeyId, secretAccessKey };
        } else if (accessKeyIdEnv && secretAccessKeyEnv) {
          credentials = {
            accessKeyId: accessKeyIdEnv,
            secretAccessKey: secretAccessKeyEnv,
          };
        } else {
          credentials = undefined;
        }

        const baseClientConfig: {
          region: string;
          endpoint?: string;
          credentials?: AwsCreds;
        } = {
          region,
          ...(endpoint ? { endpoint } : {}),
          ...(credentials ? { credentials } : {}),
        };

        return {
          ...baseClientConfig,

          consumers: [
            {
              name: 'videoStatusConsumer',
              queueUrl: statusUrl,
              ...baseClientConfig,
            },
          ],
          producers: [
            {
              name: 'videoProcessingProducer',
              queueUrl: processingUrl,
              ...baseClientConfig,
            },
          ],
        };
      },
    }),
  ],
  providers: [S3StorageAdapter, SqsVideoProcessingAdapter],
  exports: [S3StorageAdapter, SqsVideoProcessingAdapter, SqsModule],
})
export class AwsModule {}
