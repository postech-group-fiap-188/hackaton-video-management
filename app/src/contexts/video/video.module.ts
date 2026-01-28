import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/infra/database/database.module';
import { AwsModule } from 'src/infra/aws/aws.module';

import { MongooseVideoRepositoryAdapter } from 'src/infra/database/mongoose/repositories/video-repository.adapter';
import { S3StorageAdapter } from 'src/infra/aws/s3/s3-storage.adapter';
import { SqsVideoProcessingAdapter } from 'src/infra/aws/sqs/sqs-video-processing.adapter';

import { UpdateVideoStatus } from './application/usecases/update-video-status';
import { VideoGatewayImpl } from './adapters/gateway/video-gateway-impl';
import { VIDEO_GATEWAY } from './application/gateways/video-gateway.token';

@Module({
  imports: [DatabaseModule, AwsModule],
  providers: [
    {
      provide: VIDEO_GATEWAY,
      inject: [
        MongooseVideoRepositoryAdapter,
        S3StorageAdapter,
        SqsVideoProcessingAdapter,
      ],
      useFactory: (
        repo: MongooseVideoRepositoryAdapter,
        s3: S3StorageAdapter,
        sqs: SqsVideoProcessingAdapter,
      ) => new VideoGatewayImpl(repo, s3, sqs),
    },
    {
      provide: UpdateVideoStatus,
      inject: [VIDEO_GATEWAY],
      useFactory: (gateway: VideoGatewayImpl) => new UpdateVideoStatus(gateway),
    },
  ],
  exports: [UpdateVideoStatus],
})
export class VideoModule {}
