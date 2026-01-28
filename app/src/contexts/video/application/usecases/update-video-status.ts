import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';
import { VideoGateway } from '../gateways/video-gateway';

export class UpdateVideoStatus {
  constructor(
    private readonly gateway: VideoGateway,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(input: {
    videoId: string;
    status: 'SUCCEEDED' | 'ERROR';
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
