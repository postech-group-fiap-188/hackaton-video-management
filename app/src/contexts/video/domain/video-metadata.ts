import { VideoStatus } from './value-objects/video-status';

export interface VideoMetadata {
  id: string;
  userId: string;

  inputBucket: string;
  inputKey: string;

  originalFileName: string;
  contentType: string;
  size: number;

  status: VideoStatus;
  errorMessage?: string;

  createdAt: Date;
  updatedAt: Date;
}
