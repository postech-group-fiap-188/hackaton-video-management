import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { S3StorageAdapter } from './s3-storage.adapter';

jest.mock('@aws-sdk/client-s3', () => {
  const original = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...original,
    S3Client: jest.fn(),
    GetObjectCommand: jest
      .fn()
      .mockImplementation((args) => ({ __type: 'GetObjectCommand', args })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(() => ({
    done: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('fs', () => ({
  createReadStream: jest.fn(() => 'STREAM'),
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';

describe('S3StorageAdapter', () => {
  const makeConfig = (vals: Record<string, any>) =>
    ({ get: (k: string) => vals[k] }) as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({
      __client: true,
    }));
  });

  it('constructor: usa defaults e forcePathStyle=false quando sem endpoint', () => {
    new S3StorageAdapter(makeConfig({}));

    expect(S3Client).toHaveBeenCalledWith({
      region: 'us-east-1',
      endpoint: undefined,
      forcePathStyle: false,
    });
  });

  it('constructor: forcePathStyle=true quando endpoint existe', () => {
    new S3StorageAdapter(
      makeConfig({
        AWS_ENDPOINT_URL: 'http://localhost:4566',
        AWS_REGION: 'sa-east-1',
      }),
    );

    expect(S3Client).toHaveBeenCalledWith({
      region: 'sa-east-1',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
    });
  });

  it('presignGetObject: chama getSignedUrl com cmd e expiresIn', async () => {
    (getSignedUrl as jest.Mock).mockResolvedValue('SIGNED');

    const adapter = new S3StorageAdapter(makeConfig({}));
    const url = await adapter.presignGetObject({
      bucket: 'b',
      key: 'k',
      expiresInSeconds: 60,
    });

    expect(GetObjectCommand).toHaveBeenCalledWith({ Bucket: 'b', Key: 'k' });
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ __type: 'GetObjectCommand' }),
      { expiresIn: 60 },
    );
    expect(url).toBe('SIGNED');
  });

  it('uploadMultipartFromPath: monta Upload com params corretos', async () => {
    const adapter = new S3StorageAdapter(makeConfig({}));

    await adapter.uploadMultipartFromPath({
      bucket: 'b',
      key: 'k',
      filePath: '/tmp/a.mp4',
      contentType: 'video/mp4',
    });

    expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/a.mp4');
    expect(Upload).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          Bucket: 'b',
          Key: 'k',
          Body: 'STREAM',
          ContentType: 'video/mp4',
        },
        queueSize: 4,
        partSize: 10 * 1024 * 1024,
        leavePartsOnError: false,
      }),
    );
  });
});
