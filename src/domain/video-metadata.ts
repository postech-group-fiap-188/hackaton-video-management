import { UserContext } from './entities/user-context';
import { VideoStatus } from './enums/video-status';

export interface VideoMetadata {
  id: string;
  user: UserContext;

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
