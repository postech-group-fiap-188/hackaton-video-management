import { UserContextProps } from '../../domain/entities/user-context';
import { VideoMetadata } from '../../domain/video-metadata';
import { VideoStatus } from 'src/domain/enums/video-status';

export type ProcessingEvent = {
  videoId: string;
  user: UserContextProps;

  inputBucket: string;
  inputKey: string;
  outputBucket: string;
  outputZipKey: string;

  contentType: string;
  size: number;
  originalFileName: string;
  event: string;
};

export interface VideoGateway {
  createPending(input: Omit<VideoMetadata, 'status'>): Promise<VideoMetadata>;
  listByUserId(userId: string): Promise<VideoMetadata[]>;
  findById(videoId: string): Promise<VideoMetadata | null>;
  updateStatus(input: {
    videoId: string;
    status: VideoStatus;
    errorMessage?: string;
  }): Promise<boolean>;

  uploadMultipartFromPath(input: {
    bucket: string;
    key: string;
    filePath: string;
    contentType: string;
  }): Promise<void>;

  presignGetObject(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string>;

  publishProcessingEvent(input: ProcessingEvent): Promise<void>;
}
