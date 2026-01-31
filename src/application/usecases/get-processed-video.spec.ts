import { GetProcessedVideo } from './get-processed-video';
import { AppError } from '../errors/app-error';
import type { VideoGateway } from '../gateways/video-gateway';
import type { VideoMetadata } from '../../domain/video-metadata';
import { UserContext } from 'src/domain/entities/user-context';
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

const makeMeta = (overrides: Partial<VideoMetadata> = {}): VideoMetadata => {
  const base: VideoMetadata = {
    id: 'v1',
    user: UserContext.create({ id: 'u1', email: 'u1@x.com' }),
    status: VideoStatus.PENDING,
    inputBucket: 'in-bucket',
    inputKey: 'u1-v1-source.mp4',
    originalFileName: 'video.mp4',
    contentType: 'video/mp4',
    size: 123,
    errorMessage: undefined,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  return { ...base, ...overrides };
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

    const usecase = new GetProcessedVideo(
      gateway as unknown as VideoGateway,
      outputBucket,
      logger as unknown as AppLogger,
    );

    await expect(
      usecase.execute({ user, videoId: 'v1' }),
    ).rejects.toBeInstanceOf(AppError);

    expect(gateway.presignGetObject).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'get_processed_video.not_found',
      expect.objectContaining({ userId: 'u1', videoId: 'v1' }),
    );
  });

  test('throws FORBIDDEN when video belongs to another user and logs warn', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    gateway.findById.mockResolvedValueOnce(
      makeMeta({
        user: UserContext.create({ id: 'owner' }),
        status: VideoStatus.SUCCEEDED,
      }),
    );

    const usecase = new GetProcessedVideo(
      gateway as unknown as VideoGateway,
      outputBucket,
      logger as unknown as AppLogger,
    );

    await expect(
      usecase.execute({ user, videoId: 'v1' }),
    ).rejects.toBeInstanceOf(AppError);

    expect(gateway.presignGetObject).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'get_processed_video.forbidden',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        ownerUserId: 'owner',
      }),
    );
  });

  test('throws VIDEO_NOT_READY when status is not SUCCEEDED and logs warn', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    gateway.findById.mockResolvedValueOnce(
      makeMeta({ status: VideoStatus.PENDING }),
    );

    const usecase = new GetProcessedVideo(
      gateway as unknown as VideoGateway,
      outputBucket,
      logger as unknown as AppLogger,
    );

    await expect(
      usecase.execute({ user, videoId: 'v1' }),
    ).rejects.toBeInstanceOf(AppError);

    expect(gateway.presignGetObject).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'get_processed_video.not_ready',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        status: VideoStatus.PENDING,
      }),
    );
  });

  test('returns downloadUrl + bucket + key and logs success', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    gateway.findById.mockResolvedValueOnce(
      makeMeta({ status: VideoStatus.SUCCEEDED }),
    );
    gateway.presignGetObject.mockResolvedValueOnce('https://signed-url');

    const usecase = new GetProcessedVideo(
      gateway as unknown as VideoGateway,
      outputBucket,
      logger as unknown as AppLogger,
    );

    const res = await usecase.execute({ user, videoId: 'v1' });

    expect(res).toEqual({
      downloadUrl: 'https://signed-url',
      bucket: outputBucket,
      key: 'u1-v1-processed.zip',
    });

    expect(gateway.presignGetObject).toHaveBeenCalledWith({
      bucket: outputBucket,
      key: 'u1-v1-processed.zip',
      expiresInSeconds: 3600,
    });

    expect(logger.info).toHaveBeenCalledWith(
      'get_processed_video.success',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        bucket: outputBucket,
        key: 'u1-v1-processed.zip',
      }),
    );
  });
});