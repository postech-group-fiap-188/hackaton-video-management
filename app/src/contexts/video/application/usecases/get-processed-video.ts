import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';
import { AppError } from '../errors/app-error';
import { VideoGateway } from '../gateways/video-gateway';

export class GetProcessedVideo {
  constructor(
    private readonly gateway: VideoGateway,
    private readonly outputBucket: string,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(input: { userId: string; videoId: string }) {
    this.logger.info('get_processed_video.start', {
      userId: input.userId,
      videoId: input.videoId,
      outputBucket: this.outputBucket,
    });

    const meta = await this.gateway.findById(input.videoId);

    if (!meta) {
      this.logger.warn('get_processed_video.not_found', {
        userId: input.userId,
        videoId: input.videoId,
      });
      throw new AppError('Video not found', 'VIDEO_NOT_FOUND', 404);
    }

    if (meta.userId !== input.userId) {
      this.logger.warn('get_processed_video.forbidden', {
        userId: input.userId,
        videoId: input.videoId,
        ownerUserId: meta.userId,
      });
      throw new AppError('Forbidden', 'FORBIDDEN', 403);
    }

    if (meta.status !== 'SUCCEEDED') {
      this.logger.warn('get_processed_video.not_ready', {
        userId: input.userId,
        videoId: input.videoId,
        status: meta.status,
      });
      throw new AppError('Video not ready', 'VIDEO_NOT_READY', 409);
    }

    const key = `${meta.userId}-${meta.id}-processed.zip`;

    this.logger.info('get_processed_video.presign.request', {
      userId: input.userId,
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
      userId: input.userId,
      videoId: input.videoId,
      bucket: this.outputBucket,
      key,
    });

    return { downloadUrl, bucket: this.outputBucket, key };
  }
}
