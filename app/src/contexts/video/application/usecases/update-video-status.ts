import { VideoGateway } from '../gateways/video-gateway';

export class UpdateVideoStatus {
  constructor(private readonly gateway: VideoGateway) {}

  async execute(input: {
    videoId: string;
    status: 'SUCCEEDED' | 'ERROR';
    errorMessage?: string;
  }) {
    const ok = await this.gateway.updateStatus(input);
    return { ok };
  }
}
