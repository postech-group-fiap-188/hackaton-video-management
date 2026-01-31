import {
  UserContext,
  UserContextProps,
} from '../../domain/entities/user-context';
import { VideoGateway } from '../gateways/video-gateway';
import type { AppLogger } from 'src/application/ports/app-logger';

export class ListUserVideos {
  constructor(
    private readonly gateway: VideoGateway,
    private readonly logger: AppLogger,
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
