import { VideoGatewayImpl } from './video-gateway-impl';
import type { VideoMetadata } from '../../domain/video-metadata';

type Repo = {
  createPending: (input: Omit<VideoMetadata, 'status'> & { id?: string }) => Promise<unknown>;
  listByUserId: (userId: string) => Promise<unknown>;
  findById: (videoId: string) => Promise<unknown>;
  updateStatus: (input: {
    videoId: string;
    status: 'SUCCEEDED' | 'ERROR';
    errorMessage?: string;
  }) => Promise<unknown>;
};

type S3 = {
  uploadMultipartFromPath: (input: {
    bucket: string;
    key: string;
    filePath: string;
    contentType: string;
  }) => Promise<void>;
  presignGetObject: (input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }) => Promise<string>;
};

type Sns = {
  publishProcessingEvent: (input: { event: unknown }) => Promise<void>;
};

const makeRepo = (): jest.Mocked<Repo> => ({
  createPending: jest.fn(),
  listByUserId: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
});

const makeS3 = (): jest.Mocked<S3> => ({
  uploadMultipartFromPath: jest.fn(),
  presignGetObject: jest.fn(),
});

const makeSns = (): jest.Mocked<Sns> => ({
  publishProcessingEvent: jest.fn(),
});

describe('VideoGatewayImpl', () => {
  it('delegates repo methods', async () => {
    const repo = makeRepo();
    const s3 = makeS3();
    const sns = makeSns();

    repo.listByUserId.mockResolvedValueOnce([]);
    repo.findById.mockResolvedValueOnce(null);
    repo.updateStatus.mockResolvedValueOnce(true);
    repo.createPending.mockResolvedValueOnce({});

    const gtw = new VideoGatewayImpl(repo as never, s3 as never, sns as never);

    await gtw.listByUserId('u1');
    expect(repo.listByUserId).toHaveBeenCalledWith('u1');

    await gtw.findById('v1');
    expect(repo.findById).toHaveBeenCalledWith('v1');

    await gtw.updateStatus({ videoId: 'v1', status: 'ERROR', errorMessage: 'x' });
    expect(repo.updateStatus).toHaveBeenCalledWith({
      videoId: 'v1',
      status: 'ERROR',
      errorMessage: 'x',
    });

    const now = new Date();
    await gtw.createPending({
      id: 'v1',
      userId: 'u1',
      inputBucket: 'in',
      inputKey: 'k',
      originalFileName: 'a.mp4',
      contentType: 'video/mp4',
      size: 1,
      errorMessage: undefined,
      createdAt: now,
      updatedAt: now,
    } as never);

    expect(repo.createPending).toHaveBeenCalledTimes(1);
  });

  it('delegates s3 methods', async () => {
    const repo = makeRepo();
    const s3 = makeS3();
    const sns = makeSns();

    s3.uploadMultipartFromPath.mockResolvedValueOnce(undefined);
    s3.presignGetObject.mockResolvedValueOnce('http://signed');

    const gtw = new VideoGatewayImpl(repo as never, s3 as never, sns as never);

    await gtw.uploadMultipartFromPath({
      bucket: 'in',
      key: 'k',
      filePath: '/tmp/f',
      contentType: 'video/mp4',
    });
    expect(s3.uploadMultipartFromPath).toHaveBeenCalledWith({
      bucket: 'in',
      key: 'k',
      filePath: '/tmp/f',
      contentType: 'video/mp4',
    });

    const url = await gtw.presignGetObject({
      bucket: 'out',
      key: 'zip',
      expiresInSeconds: 3600,
    });
    expect(url).toBe('http://signed');
    expect(s3.presignGetObject).toHaveBeenCalledWith({
      bucket: 'out',
      key: 'zip',
      expiresInSeconds: 3600,
    });
  });

  it('enqueueProcessing publishes via SNS', async () => {
    const repo = makeRepo();
    const s3 = makeS3();
    const sns = makeSns();

    sns.publishProcessingEvent.mockResolvedValueOnce(undefined);

    const gtw = new VideoGatewayImpl(repo as never, s3 as never, sns as never);

    const payload = {
      videoId: 'v1',
      userId: 'u1',
      inputBucket: 'in',
      inputKey: 'k',
      outputBucket: 'out',
      outputZipKey: 'z',
      contentType: 'video/mp4',
      size: 10,
    };

    await gtw.publishProcessingEvent(payload);

    expect(sns.publishProcessingEvent).toHaveBeenCalledWith({ event: payload });
  });
});
