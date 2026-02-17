import { VideoGatewayImpl } from './video-gateway-impl';
import { Video } from 'src/domain/entities/video';
import { User } from 'src/domain/entities/user';
import { VideoStatus } from 'src/domain/enums/video-status';

type Repo = {
  createVideoMetaData: jest.Mock;
  listByUserId: jest.Mock;
  findById: jest.Mock;
  updateStatus: jest.Mock;
};

type S3 = {
  uploadMultipartFromPath: jest.Mock;
  presignGetObject: jest.Mock;
  presignPutObject: jest.Mock;
};

type Sns = {
  publishProcessingEvent: jest.Mock;
};

const makeRepo = (): Repo => ({
  createVideoMetaData: jest.fn(),
  listByUserId: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
});

const makeS3 = (): S3 => ({
  uploadMultipartFromPath: jest.fn(),
  presignGetObject: jest.fn(),
  presignPutObject: jest.fn(),
});

const makeSns = (): Sns => ({
  publishProcessingEvent: jest.fn(),
});

describe('VideoGatewayImpl', () => {
  it('maps repository record to Video entity', async () => {
    const repo = makeRepo();
    const s3 = makeS3();
    const sns = makeSns();

    const now = new Date('2026-01-30T12:00:00.000Z');

    repo.listByUserId.mockResolvedValueOnce([
      {
        id: 'v1',
        userId: 'u1',
        inputBucket: 'in',
        inputKey: 'u1-v1-source.mp4',
        originalFileName: 'video.mp4',
        contentType: 'video/mp4',
        size: 10,
        status: 'PENDING',
        errorMessage: undefined,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    repo.findById.mockResolvedValueOnce({
      id: 'v2',
      userId: 'u1',
      inputBucket: 'in',
      inputKey: 'u1-v2-source.mp4',
      originalFileName: 'video2.mp4',
      contentType: 'video/mp4',
      size: 20,
      status: 'SUCCEEDED',
      errorMessage: undefined,
      createdAt: now,
      updatedAt: now,
    });

    const gtw = new VideoGatewayImpl(repo as never, s3 as never, sns as never);

    const list = await gtw.listByUserId('u1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('v1');
    expect(list[0].user.id).toBe('u1');

    const one = await gtw.findById('v2');
    expect(one?.id).toBe('v2');
    expect(one?.status).toBe(VideoStatus.SUCCEEDED);
  });

  it('findById returns null when repository returns null', async () => {
    const repo = makeRepo();
    const s3 = makeS3();
    const sns = makeSns();

    repo.findById.mockResolvedValueOnce(null);

    const gtw = new VideoGatewayImpl(repo as never, s3 as never, sns as never);

    const res = await gtw.findById('missing');
    expect(res).toBeNull();
    expect(repo.findById).toHaveBeenCalledWith('missing');
  });

  it('createVideoMetaData maps Video -> repository input and returns Video', async () => {
    const repo = makeRepo();
    const s3 = makeS3();
    const sns = makeSns();

    const now = new Date('2026-01-30T12:00:00.000Z');
    const user = User.create({ id: 'u1' });

    const pending = new Video(
      user,
      'in',
      'u1-v1-source.mp4',
      'video.mp4',
      'video/mp4',
      10,
      VideoStatus.PENDING,
      undefined,
      now,
      now,
      'v1',
    );

    repo.createVideoMetaData.mockResolvedValueOnce({
      id: 'v1',
      userId: 'u1',
      inputBucket: 'in',
      inputKey: 'u1-v1-source.mp4',
      originalFileName: 'video.mp4',
      contentType: 'video/mp4',
      size: 10,
      status: 'PENDING',
      errorMessage: undefined,
      createdAt: now,
      updatedAt: now,
    });

    const gtw = new VideoGatewayImpl(repo as never, s3 as never, sns as never);

    const created = await gtw.createVideoMetaData(pending);

    expect(repo.createVideoMetaData).toHaveBeenCalledWith({
      id: 'v1',
      userId: 'u1',
      inputBucket: 'in',
      inputKey: 'u1-v1-source.mp4',
      originalFileName: 'video.mp4',
      contentType: 'video/mp4',
      size: 10,
      errorMessage: undefined,
      createdAt: now,
      updatedAt: now,
    });

    expect(created.id).toBe('v1');
    expect(created.status).toBe(VideoStatus.PENDING);
    expect(created.user.id).toBe('u1');
  });

  it('updateStatus delegates to repository.updateStatus', async () => {
    const repo = makeRepo();
    const s3 = makeS3();
    const sns = makeSns();

    repo.updateStatus.mockResolvedValueOnce(true);

    const gtw = new VideoGatewayImpl(repo as never, s3 as never, sns as never);

    const input = {
      videoId: 'v1',
      status: VideoStatus.ERROR,
      errorMessage: 'boom',
    };

    const res = await gtw.updateStatus(input);

    expect(repo.updateStatus).toHaveBeenCalledWith({
      videoId: 'v1',
      status: VideoStatus.ERROR,
      errorMessage: 'boom',
    });

    expect(res).toBe(true);
  });

  it('delegates storage and publisher calls', async () => {
    const repo = makeRepo();
    const s3 = makeS3();
    const sns = makeSns();

    s3.uploadMultipartFromPath.mockResolvedValueOnce(undefined);
    s3.presignGetObject.mockResolvedValueOnce('https://example.com/presigned');
    sns.publishProcessingEvent.mockResolvedValueOnce(undefined);

    const gtw = new VideoGatewayImpl(repo as never, s3 as never, sns as never);

    await gtw.uploadMultipartFromPath({
      bucket: 'b',
      key: 'k',
      filePath: '/tmp/x',
      contentType: 'video/mp4',
    });
    expect(s3.uploadMultipartFromPath).toHaveBeenCalledWith({
      bucket: 'b',
      key: 'k',
      filePath: '/tmp/x',
      contentType: 'video/mp4',
    });

    await gtw.presignGetObject({ bucket: 'b', key: 'k', expiresInSeconds: 60 });
    expect(s3.presignGetObject).toHaveBeenCalledWith({
      bucket: 'b',
      key: 'k',
      expiresInSeconds: 60,
    });

    s3.presignPutObject.mockResolvedValueOnce('https://example.com/presigned-put');
    await gtw.presignPutObject({
      bucket: 'b',
      key: 'k',
      contentType: 'video/mp4',
      expiresInSeconds: 300,
    });
    expect(s3.presignPutObject).toHaveBeenCalledWith({
      bucket: 'b',
      key: 'k',
      contentType: 'video/mp4',
      expiresInSeconds: 300,
    });

    const event = {
      videoId: 'v1',
      user: { id: 'u1' },
      inputBucket: 'in',
      inputKey: 'k',
      outputBucket: 'out',
      outputZipKey: 'z',
      contentType: 'video/mp4',
      size: 10,
      originalFileName: 'video.mp4',
      event: 'VIDEO_PENDING',
    };

    await gtw.publishProcessingEvent(event as any);
    expect(sns.publishProcessingEvent).toHaveBeenCalledWith({ event });
  });
});
