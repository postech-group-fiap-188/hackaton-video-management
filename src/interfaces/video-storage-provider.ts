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
}
