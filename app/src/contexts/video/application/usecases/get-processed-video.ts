import { AppError } from '../errors/app-error';
import { VideoGateway } from '../gateways/video-gateway';

export class GetProcessedZip {
  constructor(
    private readonly gateway: VideoGateway,
    private readonly outputBucket: string,
  ) {}

  async execute(input: { userId: string; videoId: string }) {
    const meta = await this.gateway.findById(input.videoId);
    if (!meta) throw new AppError('Video not found', 'VIDEO_NOT_FOUND', 404);
    if (meta.userId !== input.userId)
      throw new AppError('Forbidden', 'FORBIDDEN', 403);

    const key = `${meta.userId}-${meta.id}-processed.zip`;
    const downloadUrl = await this.gateway.presignGetObject({
      bucket: this.outputBucket,
      key,
      expiresInSeconds: 3600,
    });

    return { downloadUrl, bucket: this.outputBucket, key };
  }
}
