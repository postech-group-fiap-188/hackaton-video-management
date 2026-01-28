import { UpdateVideoStatus } from './update-video-status';
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
    updateStatus: jest.fn(),
  }) as unknown as jest.Mocked<Pick<VideoGateway, 'updateStatus'>>;

describe('UpdateVideoStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('logs success when updateStatus returns true', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    gateway.updateStatus.mockResolvedValueOnce(true);

    const usecase = new UpdateVideoStatus(gateway as any, logger as any);

    const res = await usecase.execute({
      videoId: 'v1',
      status: 'SUCCEEDED',
    });

    expect(res).toEqual({ ok: true });

    expect(logger.info).toHaveBeenCalledWith(
      'update_video_status.start',
      expect.objectContaining({ videoId: 'v1', status: 'SUCCEEDED', hasErrorMessage: false }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      'update_video_status.success',
      expect.objectContaining({ videoId: 'v1', status: 'SUCCEEDED' }),
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('logs warn when updateStatus returns false', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    gateway.updateStatus.mockResolvedValueOnce(false);

    const usecase = new UpdateVideoStatus(gateway as any, logger as any);

    const res = await usecase.execute({
      videoId: 'v1',
      status: 'ERROR',
      errorMessage: 'boom',
    });

    expect(res).toEqual({ ok: false });

    expect(logger.warn).toHaveBeenCalledWith(
      'update_video_status.failed',
      expect.objectContaining({ videoId: 'v1', status: 'ERROR' }),
    );
  });
});
