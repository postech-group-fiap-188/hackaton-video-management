import type { AppLogger } from 'src/video/application/ports/app-logger';
import { VideoGateway } from '../gateways/video-gateway';
import { VideoStatus } from 'src/video/domain/enums/video-status';

export class UpdateVideoStatus {
  constructor(
    private readonly gateway: VideoGateway,
    private readonly logger: AppLogger,
  ) {}

  async execute(input: {
    videoId: string;
    status: VideoStatus;
    errorMessage?: string;
  }) {
    this.logger.info('update_video_status.start', {
      videoId: input.videoId,
      status: input.status,
      hasErrorMessage: Boolean(input.errorMessage),
    });

    const ok = await this.gateway.updateStatus(input);

    if (ok) {
      this.logger.info('update_video_status.success', {
        videoId: input.videoId,
        status: input.status,
      });
    } else {
      this.logger.warn('update_video_status.failed', {
        videoId: input.videoId,
        status: input.status,
      });
    }

    return { ok };
  }
}
