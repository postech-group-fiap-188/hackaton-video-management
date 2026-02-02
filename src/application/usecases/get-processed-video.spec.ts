import { GetProcessedVideo } from './get-processed-video';
import { AppError } from '../../domain/errors/app-error';
import type { VideoGateway } from '../gateways/video-gateway';
import { Video } from 'src/domain/entities/video';
import { User } from 'src/domain/entities/user-context';
import type { AppLogger } from 'src/application/ports/app-logger';
import { VideoStatus } from 'src/domain/enums/video-status';

type LoggerMock = {
  info: jest.Mock<void, [string, Record<string, unknown>?]>;
  warn: jest.Mock<void, [string, Record<string, unknown>?]>;
  error: jest.Mock<void, [string, Record<string, unknown>?]>;
};

const makeLogger = (): LoggerMock => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

type GatewayMock = jest.Mocked<
  Pick<VideoGateway, 'findById' | 'presignGetObject'>
>;

const makeGateway = (): GatewayMock =>
  ({
    findById: jest.fn(),
    presignGetObject: jest.fn(),
  }) as GatewayMock;

const makeVideo = (overrides: Partial<Video> = {}) => {
  const now = new Date('2026-01-30T12:00:00.000Z');

  const base = new Video(
    User.create({ id: 'u1' }),
    'in-bucket',
    'u1-v1-source.mp4',
    'video.mp4',
    'video/mp4',
    10,
    VideoStatus.SUCCEEDED,
    undefined,
    now,
    now,
    'v1',
  );

  return { ...base, ...(overrides as any) } as Video;
};

describe('GetProcessedVideo', () => {
  const outputBucket = 'out-bucket';
  const user = { id: 'u1', email: 'u1@x.com' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws VIDEO_NOT_FOUND when meta not found and logs warn', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    gateway.findById.mockResolvedValueOnce(null);

    const uc = new GetProcessedVideo(
      gateway as unknown as VideoGateway,
      outputBucket,
      logger as unknown as AppLogger,
    );

    await expect(uc.execute({ user, videoId: 'v1' })).rejects.toMatchObject<
      Partial<AppError>
    >({
      code: 'VIDEO_NOT_FOUND',
      statusCode: 404,
    });

    expect(logger.warn).toHaveBeenCalledWith('get_processed_video.not_found', {
      userId: 'u1',
      videoId: 'v1',
    });
  });

  test('throws FORBIDDEN when requesting user is not the owner', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const meta = new Video(
      User.create({ id: 'u2' }),
      'in-bucket',
      'u2-v1-source.mp4',
      'video.mp4',
      'video/mp4',
      10,
      VideoStatus.SUCCEEDED,
      undefined,
      new Date('2026-01-30T12:00:00.000Z'),
      new Date('2026-01-30T12:00:00.000Z'),
      'v1',
    );

    gateway.findById.mockResolvedValueOnce(meta);

    const uc = new GetProcessedVideo(
      gateway as unknown as VideoGateway,
      outputBucket,
      logger as unknown as AppLogger,
    );

    await expect(uc.execute({ user, videoId: 'v1' })).rejects.toMatchObject<
      Partial<AppError>
    >({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  });

  test('throws VIDEO_NOT_READY when status is not SUCCEEDED', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const meta = new Video(
      User.create({ id: 'u1' }),
      'in-bucket',
      'u1-v1-source.mp4',
      'video.mp4',
      'video/mp4',
      10,
      VideoStatus.PENDING,
      undefined,
      new Date('2026-01-30T12:00:00.000Z'),
      new Date('2026-01-30T12:00:00.000Z'),
      'v1',
    );

    gateway.findById.mockResolvedValueOnce(meta);

    const uc = new GetProcessedVideo(
      gateway as unknown as VideoGateway,
      outputBucket,
      logger as unknown as AppLogger,
    );

    await expect(uc.execute({ user, videoId: 'v1' })).rejects.toMatchObject<
      Partial<AppError>
    >({
      code: 'VIDEO_NOT_READY',
      statusCode: 409,
    });
  });

  test('returns presigned url when SUCCEEDED', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const meta = new Video(
      User.create({ id: 'u1' }),
      'in-bucket',
      'u1-v1-source.mp4',
      'video.mp4',
      'video/mp4',
      10,
      VideoStatus.SUCCEEDED,
      undefined,
      new Date('2026-01-30T12:00:00.000Z'),
      new Date('2026-01-30T12:00:00.000Z'),
      'v1',
    );

    gateway.findById.mockResolvedValueOnce(meta);
    gateway.presignGetObject.mockResolvedValueOnce(
      'https://example.com/presigned.zip',
    );

    const uc = new GetProcessedVideo(
      gateway as unknown as VideoGateway,
      outputBucket,
      logger as unknown as AppLogger,
    );

    const res = await uc.execute({ user, videoId: 'v1' });

    expect(res.downloadUrl).toBe('https://example.com/presigned.zip');
    expect(gateway.presignGetObject).toHaveBeenCalledWith({
      bucket: outputBucket,
      key: 'u1-v1-processed.zip',
      expiresInSeconds: 3600,
    });
  });
});
