import { Video } from 'src/domain/entities/video';

export class ListVideosPresenter {
  static toJSON(videos: Video[]) {
    return {
      items: videos.map((v) => ({
        id: v.id,
        user: { props: v.user.toProps() },

        inputBucket: v.inputBucket,
        inputKey: v.inputKey,

        originalFileName: v.originalFileName,
        contentType: v.contentType,
        size: v.size,

        status: v.status,
        errorMessage: v.errorMessage,

        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
    };
  }
}
