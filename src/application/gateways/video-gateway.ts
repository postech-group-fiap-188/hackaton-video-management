import { UserProps } from '../../domain/entities/user';
import { Video } from '../../domain/entities/video';
import { VideoStatus } from 'src/domain/enums/video-status';

export type ProcessingEvent = {
  videoId: string;
  user: UserProps;

  inputBucket: string;
  inputKey: string;

  outputBucket: string;
  outputZipKey: string;

  contentType: string;
  size: number;
  originalFileName: string;

  event: 'VIDEO_PENDING';
};

export abstract class VideoGateway {
  abstract createVideoMetaData(video: Video): Promise<Video>;
  abstract listByUserId(userId: string): Promise<Video[]>;
  abstract findById(videoId: string): Promise<Video | null>;

  abstract updateStatus(input: {
    videoId: string;
    status: VideoStatus;
    errorMessage?: string;
  }): Promise<boolean>;

  abstract uploadMultipartFromPath(input: {
    bucket: string;
    key: string;
    filePath: string;
    contentType: string;
  }): Promise<void>;

  abstract presignGetObject(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string>;

  abstract presignPutObject(input: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
    metadata?: Record<string, string>;
  }): Promise<string>;

  abstract publishProcessingEvent(input: ProcessingEvent): Promise<void>;
}
