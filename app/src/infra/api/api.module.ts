import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { DatabaseModule } from 'src/infra/database/database.module';
import { AwsModule } from 'src/infra/aws/aws.module';

import { VideosHttpController } from './controllers/videos-http.controller';
import { AppLoggerService } from './common/logger/app-logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';

import { VideoGatewayImpl } from 'src/contexts/video/adapters/gateway/video-gateway-impl';
import { MongooseVideoRepositoryAdapter } from 'src/infra/database/mongoose/repositories/video-repository.adapter';
import { S3StorageAdapter } from 'src/infra/aws/s3/s3-storage.adapter';
import type { VideoDataSource } from 'src/interfaces/video-data-source';
import { VIDEO_DATA_SOURCE } from 'src/interfaces/video-data-source.token';
import { CommonModule } from './common/common.module';
import { SnsVideoProcessingAdapter } from '../aws/sns/sns-video-processing.adapter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AwsModule,
    CommonModule,
  ],
  controllers: [VideosHttpController],
  providers: [
    AppLoggerService,

    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },

    {
      provide: VIDEO_DATA_SOURCE,
      inject: [
        ConfigService,
        AppLoggerService,
        MongooseVideoRepositoryAdapter,
        S3StorageAdapter,
        SnsVideoProcessingAdapter,
      ],
      useFactory: (
        config: ConfigService,
        logger: AppLoggerService,
        repo: MongooseVideoRepositoryAdapter,
        s3: S3StorageAdapter,
        sns: SnsVideoProcessingAdapter,
      ): VideoDataSource => {
        const inputBucket = must(
          config.get<string>('S3_INPUT_BUCKET_NAME'),
          'S3_INPUT_BUCKET_NAME',
        );
        const outputBucket = must(
          config.get<string>('S3_OUTPUT_BUCKET_NAME'),
          'S3_OUTPUT_BUCKET_NAME',
        );

        const gateway = new VideoGatewayImpl(repo, s3, sns);

        return {
          gateway,
          logger,
          config: {
            inputBucket,
            outputBucket,
            maxVideoBytes: Number(
              config.get<string>('MAX_VIDEO_BYTES') ?? '2147483648',
            ),
          },
        };
      },
    },
  ],
  exports: [],
})
export class ApiModule {}

function must(v: string | undefined, name: string): string {
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
