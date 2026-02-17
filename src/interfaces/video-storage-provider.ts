export abstract class VideoStorageProvider {
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
}
