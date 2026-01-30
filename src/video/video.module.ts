import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseModule } from 'src/infra/database/database.module';
import { AwsModule } from 'src/infra/aws/aws.module';

import { MongooseVideoRepositoryAdapter } from 'src/infra/database/mongoose/repositories/video-repository.adapter';
import { S3StorageAdapter } from 'src/infra/aws/s3/s3-storage.adapter';
import { SnsVideoProcessingAdapter } from 'src/infra/aws/sns/sns-video-processing.adapter';

import { VideoGatewayImpl } from './adapters/gateway/video-gateway-impl';
import { VIDEO_GATEWAY } from './application/gateways/video-gateway.token';

import { UpdateVideoStatus } from './application/usecases/update-video-status';
import { UploadVideos } from './application/usecases/upload-videos';
import { GetProcessedVideo } from './application/usecases/get-processed-video';
import { ListUserVideos } from './application/usecases/list-user-videos';
import { VideoGateway } from './application/gateways/video-gateway';
import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';

@Module({
  imports: [DatabaseModule, AwsModule],
  providers: [
    {
      provide: VIDEO_GATEWAY,
      inject: [
        MongooseVideoRepositoryAdapter,
        S3StorageAdapter,
        SnsVideoProcessingAdapter,
      ],
      useFactory: (
        repo: MongooseVideoRepositoryAdapter,
        s3: S3StorageAdapter,
        sns: SnsVideoProcessingAdapter,
      ) => new VideoGatewayImpl(repo, s3, sns),
    },
    {
      provide: UpdateVideoStatus,
      inject: [VIDEO_GATEWAY, AppLoggerService],
      useFactory: (gateway: VideoGateway, logger: AppLoggerService) =>
        new UpdateVideoStatus(gateway, logger),
    },
    {
      provide: UploadVideos,
      inject: [VIDEO_GATEWAY, ConfigService, AppLoggerService],
      useFactory: (
        gateway: VideoGateway,
        config: ConfigService,
        logger: AppLoggerService,
      ) => {
        const inputBucket = config.get<string>('S3_INPUT_BUCKET_NAME');
        const outputBucket = config.get<string>('S3_OUTPUT_BUCKET_NAME');
        if (!inputBucket) throw new Error('Missing S3_INPUT_BUCKET_NAME');
        if (!outputBucket) throw new Error('Missing S3_OUTPUT_BUCKET_NAME');

        return new UploadVideos(
          gateway,
          {
            inputBucket,
            outputBucket,
          },
          logger,
        );
      },
    },

    {
      provide: GetProcessedVideo,
      inject: [VIDEO_GATEWAY, ConfigService, AppLoggerService],
      useFactory: (
        gateway: VideoGateway,
        config: ConfigService,
        logger: AppLoggerService,
      ) => {
        const outputBucket = config.get<string>('S3_OUTPUT_BUCKET_NAME');
        if (!outputBucket) throw new Error('Missing S3_OUTPUT_BUCKET_NAME');
        return new GetProcessedVideo(gateway, outputBucket, logger);
      },
    },

    {
      provide: ListUserVideos,
      inject: [VIDEO_GATEWAY, AppLoggerService],
      useFactory: (gateway: VideoGateway, logger: AppLoggerService) =>
        new ListUserVideos(gateway, logger),
    },
  ],
  exports: [UpdateVideoStatus, UploadVideos, GetProcessedVideo, ListUserVideos],
})
export class VideoModule {}
