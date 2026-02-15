import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { DatabaseModule } from 'src/infra/database/database.module';
import { AwsModule } from 'src/infra/aws/aws.module';

import { VideosHttpController } from './controllers/videos-http.controller';
import { AppLoggerService } from './common/logger/app-logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';

import { VideoRepositoryDataSource } from 'src/interfaces/video-repository-data-source';
import { VideoStorageProvider } from 'src/interfaces/video-storage-provider';
import { VideoProcessingPublisher } from 'src/interfaces/video-processing-publisher';

import { MongooseVideoRepositoryAdapter } from 'src/infra/database/mongoose/repositories/video-repository.adapter';
import { S3StorageAdapter } from 'src/infra/aws/s3/s3-storage.adapter';
import { SnsVideoProcessingAdapter } from 'src/infra/aws/sns/sns-video-processing.adapter';

@Module({
  imports: [ConfigModule, DatabaseModule, AwsModule],
  controllers: [VideosHttpController],
  providers: [
    AppLoggerService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },

    {
      provide: VideoRepositoryDataSource,
      useExisting: MongooseVideoRepositoryAdapter,
    },
    { provide: VideoStorageProvider, useExisting: S3StorageAdapter },
    {
      provide: VideoProcessingPublisher,
      useExisting: SnsVideoProcessingAdapter,
    },
  ],
})
export class ApiModule {}
