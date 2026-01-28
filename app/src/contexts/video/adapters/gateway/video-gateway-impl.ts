import { VideoGateway } from 'src/contexts/video/application/gateways/video-gateway';
import { VideoMetadata } from 'src/contexts/video/domain/video-metadata';
import { MongooseVideoRepositoryAdapter } from 'src/infra/database/mongoose/repositories/video-repository.adapter';
import { S3StorageAdapter } from 'src/infra/aws/s3/s3-storage.adapter';
import { SnsVideoProcessingAdapter } from 'src/infra/aws/sns/sns-video-processing.adapter';

export class VideoGatewayImpl implements VideoGateway {
  constructor(
    private readonly repo: MongooseVideoRepositoryAdapter,
    private readonly s3: S3StorageAdapter,
    private readonly sns: SnsVideoProcessingAdapter,
  ) {}

  createPending(input: Omit<VideoMetadata, 'status'>): Promise<VideoMetadata> {
    return this.repo.createPending(input);
  }
  listByUserId(userId: string): Promise<VideoMetadata[]> {
    return this.repo.listByUserId(userId);
  }
  findById(videoId: string): Promise<VideoMetadata | null> {
    return this.repo.findById(videoId);
  }
  updateStatus(input: {
    videoId: string;
    status: 'SUCCEEDED' | 'ERROR';
    errorMessage?: string;
  }): Promise<boolean> {
    return this.repo.updateStatus(input);
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

  publishProcessingEvent(input: {
    videoId: string;
    userId: string;
    inputBucket: string;
    inputKey: string;
    outputBucket: string;
    outputZipKey: string;
    contentType: string;
    size: number;
  }): Promise<void> {
    return this.sns.publishProcessingEvent({ event: input });
  }
}
