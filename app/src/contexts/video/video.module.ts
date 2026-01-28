import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseModule } from 'src/infra/database/database.module';
import { AwsModule } from 'src/infra/aws/aws.module';

import { MongooseVideoRepositoryAdapter } from 'src/infra/database/mongoose/repositories/video-repository.adapter';
import { S3StorageAdapter } from 'src/infra/aws/s3/s3-storage.adapter';
import { SnsVideoProcessingAdapter } from 'src/infra/aws/sns/sns-video-processing.adapter';

import pLimit from 'p-limit';

import { VideoGatewayImpl } from './adapters/gateway/video-gateway-impl';
import { VIDEO_GATEWAY } from './application/gateways/video-gateway.token';

import { UpdateVideoStatus } from './application/usecases/update-video-status';
import { UploadVideos } from './application/usecases/upload-videos';
import { GetProcessedVideo } from './application/usecases/get-processed-video';
import { ListUserVideos } from './application/usecases/list-user-videos';
import { VideoGateway } from './application/gateways/video-gateway';

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
      inject: [VIDEO_GATEWAY],
      useFactory: (gateway: VideoGateway) => new UpdateVideoStatus(gateway),
    },
    {
      provide: UploadVideos,
      inject: [VIDEO_GATEWAY, ConfigService],
      useFactory: (gateway: VideoGateway, config: ConfigService) => {
        const inputBucket = config.get<string>('S3_INPUT_BUCKET_NAME');
        const outputBucket = config.get<string>('S3_OUTPUT_BUCKET_NAME');
        if (!inputBucket) throw new Error('Missing S3_INPUT_BUCKET_NAME');
        if (!outputBucket) throw new Error('Missing S3_OUTPUT_BUCKET_NAME');

        const perRequestParallel = Number(
          config.get<string>('UPLOAD_PER_REQUEST_PARALLEL') ?? '2',
        );
        const globalParallel = Number(
          config.get<string>('UPLOAD_GLOBAL_PARALLEL') ?? '6',
        );

        return new UploadVideos(gateway, {
          inputBucket,
          outputBucket,
          perRequestParallel: Number.isFinite(perRequestParallel)
            ? Math.max(1, perRequestParallel)
            : 2,
          globalLimiter: pLimit(
            Number.isFinite(globalParallel) ? Math.max(1, globalParallel) : 6,
          ),
        });
      },
    },

    {
      provide: GetProcessedVideo,
      inject: [VIDEO_GATEWAY, ConfigService],
      useFactory: (gateway: VideoGateway, config: ConfigService) => {
        const outputBucket = config.get<string>('S3_OUTPUT_BUCKET_NAME');
        if (!outputBucket) throw new Error('Missing S3_OUTPUT_BUCKET_NAME');
        return new GetProcessedVideo(gateway, outputBucket);
      },
    },

    {
      provide: ListUserVideos,
      inject: [VIDEO_GATEWAY],
      useFactory: (gateway: VideoGateway) => new ListUserVideos(gateway),
    },
  ],
  exports: [UpdateVideoStatus, UploadVideos, GetProcessedVideo, ListUserVideos],
})
export class VideoModule {}
