import { VideoGateway } from '../gateways/video-gateway';

export class ListUserVideos {
  constructor(private readonly gateway: VideoGateway) {}
  async execute(userId: string) {
    const videos = await this.gateway.listByUserId(userId);
    return { videos };
  }
}
