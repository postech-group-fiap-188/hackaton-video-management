import { VideoMetadata } from '../../domain/video-metadata';

export interface VideoGateway {
  createPending(input: Omit<VideoMetadata, 'status'>): Promise<VideoMetadata>;
  listByUserId(userId: string): Promise<VideoMetadata[]>;
  findById(videoId: string): Promise<VideoMetadata | null>;
  updateStatus(input: {
    videoId: string;
    status: 'SUCCEEDED' | 'ERROR';
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

  enqueueProcessing(input: {
    videoId: string;
    userId: string;
    inputBucket: string;
    inputKey: string;
    outputBucket: string;
    outputZipKey: string;
    contentType: string;
    size: number;
  }): Promise<void>;
}
