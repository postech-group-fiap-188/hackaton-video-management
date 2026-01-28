import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SqsModule } from '@ssut/nestjs-sqs';

import { S3StorageAdapter } from './s3/s3-storage.adapter';
import { SnsVideoProcessingAdapter } from './sns/sns-video-processing.adapter';

@Module({
  imports: [
    ConfigModule,
    SqsModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const region = config.get<string>('AWS_REGION') ?? 'us-east-1';
        const endpoint = config.get<string>('AWS_ENDPOINT_URL') ?? undefined;

        const statusUrl = config.get<string>('SQS_STATUS_QUEUE_URL');
        if (!statusUrl) throw new Error('Missing SQS_STATUS_QUEUE_URL');

        return {
          consumers: [
            {
              name: 'videoStatusConsumer',
              queueUrl: statusUrl,
              region,
              endpoint,
            },
          ],
          producers: [],
        };
      },
    }),
  ],
  providers: [S3StorageAdapter, SnsVideoProcessingAdapter],
  exports: [S3StorageAdapter, SnsVideoProcessingAdapter],
})
export class AwsModule {}
