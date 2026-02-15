import { Video } from 'src/domain/entities/video';
import { User } from 'src/domain/entities/user';
import { VideoStatus } from 'src/domain/enums/video-status';

import {
  VideoGateway,
  ProcessingEvent,
} from 'src/application/gateways/video-gateway';

import { VideoRepositoryDataSource } from 'src/interfaces/video-repository-data-source';
import { VideoStorageProvider } from 'src/interfaces/video-storage-provider';
import { VideoProcessingPublisher } from 'src/interfaces/video-processing-publisher';

export class VideoGatewayImpl implements VideoGateway {
  constructor(
    private readonly repo: VideoRepositoryDataSource,
    private readonly s3: VideoStorageProvider,
    private readonly sns: VideoProcessingPublisher,
  ) {}

  async createVideoMetaData(video: Video): Promise<Video> {
    const created = await this.repo.createVideoMetaData({
      id: video.id,
      userId: video.user.id,

      inputBucket: video.inputBucket,
      inputKey: video.inputKey,

      originalFileName: video.originalFileName,
      contentType: video.contentType,
      size: video.size,

      errorMessage: video.errorMessage,

      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    });

    return new Video(
      User.create({ id: created.userId }),

      created.inputBucket,
      created.inputKey,

      created.originalFileName,
      created.contentType,
      created.size,

      created.status as VideoStatus,
      created.errorMessage,

      created.createdAt,
      created.updatedAt,

      created.id,
    );
  }

  async listByUserId(userId: string): Promise<Video[]> {
    const items = await this.repo.listByUserId(userId);

    return items.map(
      (video) =>
        new Video(
          User.create({ id: video.userId }),

          video.inputBucket,
          video.inputKey,

          video.originalFileName,
          video.contentType,
          video.size,

          video.status as VideoStatus,
          video.errorMessage,

          video.createdAt,
          video.updatedAt,

          video.id,
        ),
    );
  }

  async findById(videoId: string): Promise<Video | null> {
    const video = await this.repo.findById(videoId);
    if (!video) return null;

    return new Video(
      User.create({ id: video.userId }),

      video.inputBucket,
      video.inputKey,

      video.originalFileName,
      video.contentType,
      video.size,

      video.status as VideoStatus,
      video.errorMessage,

      video.createdAt,
      video.updatedAt,

      video.id,
    );
  }

  updateStatus(input: {
    videoId: string;
    status: VideoStatus;
    errorMessage?: string;
  }): Promise<boolean> {
    return this.repo.updateStatus({
      videoId: input.videoId,
      status: input.status,
      errorMessage: input.errorMessage,
    });
  }

  uploadMultipartFromPath(input: {
    bucket: string;
    key: string;
    filePath: string;
    contentType: string;
  }): Promise<void> {
    return this.s3.uploadMultipartFromPath(input);
  }

  presignGetObject(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    return this.s3.presignGetObject(input);
  }

  publishProcessingEvent(input: ProcessingEvent): Promise<void> {
    return this.sns.publishProcessingEvent({ event: input });
  }
}
