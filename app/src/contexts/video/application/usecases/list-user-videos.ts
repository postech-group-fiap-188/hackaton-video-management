import {
  UserContext,
  UserContextProps,
} from '../../domain/value-objects/user-context';
import { VideoGateway } from '../gateways/video-gateway';
import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';

export class ListUserVideos {
  constructor(
    private readonly gateway: VideoGateway,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(userProps: UserContextProps) {
    const user = UserContext.create(userProps);

    this.logger.info('list_user_videos.start', { userId: user.id });

    const videos = await this.gateway.listByUserId(user.id);

    this.logger.info('list_user_videos.done', {
      userId: user.id,
      count: videos.length,
    });

    return { videos };
  }
}
