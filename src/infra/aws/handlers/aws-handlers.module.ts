import { Module } from '@nestjs/common';

import { VideoModule } from 'src/video.module';
import { AwsModule } from '../aws.module';
import { VideoStatusHandler } from './video-status.handler';
import { CommonModule } from 'src/infra/api/common/common.module';

@Module({
  imports: [AwsModule, VideoModule, CommonModule],
  providers: [VideoStatusHandler],
})
export class AwsHandlersModule {}
