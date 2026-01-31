import { VideoMetadata } from 'src/domain/video-metadata';

export class ListVideosPresenter {
  static toJSON(videos: VideoMetadata[]) {
    return {
      items: videos.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
    };
  }
}
