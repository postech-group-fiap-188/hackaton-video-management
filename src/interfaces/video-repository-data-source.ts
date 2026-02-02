export type VideoStatusRecord = 'PENDING' | 'SUCCEEDED' | 'ERROR';

export type VideoRecord = {
  id: string;
  userId: string;

  inputBucket: string;
  inputKey: string;

  originalFileName: string;
  contentType: string;
  size: number;

  status: VideoStatusRecord;
  errorMessage?: string;

  createdAt: Date;
  updatedAt: Date;
};

export abstract class VideoRepositoryDataSource {
  abstract createVideoMetaData(
    input: Omit<VideoRecord, 'status'>,
  ): Promise<VideoRecord>;
  abstract listByUserId(userId: string): Promise<VideoRecord[]>;
  abstract findById(videoId: string): Promise<VideoRecord | null>;
  abstract updateStatus(input: {
    videoId: string;
    status: VideoStatusRecord;
    errorMessage?: string;
  }): Promise<boolean>;
}
