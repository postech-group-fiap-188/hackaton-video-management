import type { AppLogger } from 'src/application/ports/app-logger';
import { AppError } from '../errors/app-error';
import type { VideoGateway } from '../gateways/video-gateway';

import { VideoStatus } from 'src/domain/enums/video-status';
import {
  UserContext,
  UserContextProps,
} from 'src/domain/entities/user-context';

export class GetProcessedVideo {
  constructor(
    private readonly gateway: VideoGateway,
    private readonly outputBucket: string,
    private readonly logger: AppLogger,
  ) {}

  async execute(input: { user: UserContextProps; videoId: string }) {
    const user = UserContext.create(input.user);

    this.logger.info('get_processed_video.start', {
      userId: user.id,
      videoId: input.videoId,
      outputBucket: this.outputBucket,
    });

    const meta = await this.gateway.findById(input.videoId);

    if (!meta) {
      this.logger.warn('get_processed_video.not_found', {
        userId: user.id,
        videoId: input.videoId,
      });
      throw new AppError('Video not found', 'VIDEO_NOT_FOUND', 404);
    }

    if (meta.user.id !== user.id) {
      this.logger.warn('get_processed_video.forbidden', {
        userId: user.id,
        videoId: input.videoId,
        ownerUserId: meta.user.id,
      });
      throw new AppError('Forbidden', 'FORBIDDEN', 403);
    }

    if (meta.status !== VideoStatus.SUCCEEDED) {
      this.logger.warn('get_processed_video.not_ready', {
        userId: user.id,
        videoId: input.videoId,
        status: meta.status,
      });
      throw new AppError('Video not ready', 'VIDEO_NOT_READY', 409);
    }

    const key = `${meta.user.id}-${meta.id}-processed.zip`;

    this.logger.info('get_processed_video.presign.request', {
      userId: user.id,
      videoId: input.videoId,
      bucket: this.outputBucket,
      key,
      expiresInSeconds: 3600,
    });

    const downloadUrl = await this.gateway.presignGetObject({
      bucket: this.outputBucket,
      key,
      expiresInSeconds: 3600,
    });

    this.logger.info('get_processed_video.success', {
      userId: user.id,
      videoId: input.videoId,
      bucket: this.outputBucket,
      key,
    });

    return { downloadUrl, bucket: this.outputBucket, key };
  }
}
