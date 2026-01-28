import { ListUserVideos } from './list-user-videos';
import type { VideoGateway } from '../gateways/video-gateway';

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

const makeGateway = () =>
  ({
    listByUserId: jest.fn(),
  }) as unknown as jest.Mocked<Pick<VideoGateway, 'listByUserId'>>;

describe('ListUserVideos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns videos and logs start/success', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    gateway.listByUserId.mockResolvedValueOnce([
      { id: 'v1' },
      { id: 'v2' },
    ] as any);

    const usecase = new ListUserVideos(gateway as any, logger as any);

    const res = await usecase.execute('u1');

    expect(res.videos).toHaveLength(2);
    expect(gateway.listByUserId).toHaveBeenCalledWith('u1');

    expect(logger.info).toHaveBeenCalledWith(
      'list_user_videos.start',
      { userId: 'u1' },
    );

    expect(logger.info).toHaveBeenCalledWith(
      'list_user_videos.success',
      { userId: 'u1', count: 2 },
    );
  });
});
