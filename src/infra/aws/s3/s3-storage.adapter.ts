import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';

@Injectable()
export class S3StorageAdapter {
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    const region = config.get<string>('AWS_REGION') ?? 'us-east-1';
    const endpoint = config.get<string>('AWS_ENDPOINT_URL') ?? undefined;

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: Boolean(endpoint),
    });
  }

  async uploadMultipartFromPath(input: {
    bucket: string;
    key: string;
    filePath: string;
    contentType: string;
  }): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: input.bucket,
        Key: input.key,
        Body: fs.createReadStream(input.filePath),
        ContentType: input.contentType,
      },
      queueSize: 4,
      partSize: 10 * 1024 * 1024,
      leavePartsOnError: false,
    });

    await upload.done();
  }

  async presignGetObject(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: input.bucket, Key: input.key });
    return getSignedUrl(this.client, cmd, {
      expiresIn: input.expiresInSeconds,
    });
  }
}
