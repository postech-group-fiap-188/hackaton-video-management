import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';
import { VideoGateway } from '../gateways/video-gateway';

export class ListUserVideos {
  constructor(
    private readonly gateway: VideoGateway,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(userId: string) {
    this.logger.info('list_user_videos.start', { userId });

    const videos = await this.gateway.listByUserId(userId);

    this.logger.info('list_user_videos.success', {
      userId,
      count: videos.length,
    });

    return { videos };
  }
}
