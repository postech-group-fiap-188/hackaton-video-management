import { VideoGateway } from 'src/video/application/gateways/video-gateway';
import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';

export interface VideoDataSource {
  gateway: VideoGateway;
  logger: AppLoggerService;
  config: {
    inputBucket: string;
    outputBucket: string;
    maxVideoBytes: number;
  };
}
