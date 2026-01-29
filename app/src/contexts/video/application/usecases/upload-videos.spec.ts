import { unlink } from 'fs/promises';
import { UploadVideos } from './upload-videos';
import type { VideoGateway } from '../gateways/video-gateway';

jest.mock('fs/promises', () => ({
  unlink: jest.fn(),
}));

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

const cfg = { inputBucket: 'in-bucket', outputBucket: 'out-bucket' };

const makeGateway = (): jest.Mocked<VideoGateway> =>
  ({
    createPending: jest.fn().mockResolvedValue(undefined as any),
    uploadMultipartFromPath: jest.fn().mockResolvedValue(undefined),
    publishProcessingEvent: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(true),
    presignGetObject: jest.fn(),
    findById: jest.fn(),
    listByUserId: jest.fn(),
  }) as unknown as jest.Mocked<VideoGateway>;

describe('UploadVideos', () => {
  const user = { id: 'user-1', email: 'u@x.com' };

  beforeEach(() => {
    jest.clearAllMocks();
    (unlink as unknown as jest.Mock).mockResolvedValue(undefined);
  });

  test('returns error when validate throws (no updateStatus; logs skipped)', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();
    const usecase = new UploadVideos(gateway, cfg, logger as any);

    const validate = jest.fn(() => {
      throw new Error('invalid_file');
    });

    const res = await usecase.execute({
      user,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 123,
          tempFilePath: '/tmp/file-1',
        },
      ],
      validate,
    });

    expect(res.items).toHaveLength(1);

    const item = res.items[0];
    expect(item.ok).toBe(false);
    if (!item.ok) {
      expect(item.originalFileName).toBe('video.mp4');
      expect(item.status).toBe('ERROR');
      expect(item.errorMessage).toBe('invalid_file');
      expect(item.videoId).toEqual(expect.any(String));
    }

    expect(gateway.createPending).not.toHaveBeenCalled();
    expect(gateway.uploadMultipartFromPath).not.toHaveBeenCalled();
    expect(gateway.publishProcessingEvent).not.toHaveBeenCalled();
    expect(gateway.updateStatus).not.toHaveBeenCalled();

    expect(unlink).toHaveBeenCalledWith('/tmp/file-1');

    expect(logger.warn).toHaveBeenCalledWith(
      'upload_videos.update_status.skipped',
      expect.objectContaining({
        userId: 'user-1',
        reason: 'pending_not_created',
        errorMessage: 'invalid_file',
      }),
    );
  });

  test('if createPending succeeds but upload fails, updateStatus fails -> logs update_status.failed and does not crash', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();
    const usecase = new UploadVideos(gateway, cfg, logger as any);

    gateway.uploadMultipartFromPath.mockRejectedValueOnce(new Error('s3_fail'));
    gateway.updateStatus.mockRejectedValueOnce(new Error('update_fail'));

    const res = await usecase.execute({
      user,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 123,
          tempFilePath: '/tmp/file-1',
        },
      ],
      validate: jest.fn(),
    });

    expect(res.items).toHaveLength(1);
    const item = res.items[0];

    expect(item.ok).toBe(false);
    if (!item.ok) {
      expect(item.errorMessage).toBe('s3_fail');
      expect(item.videoId).toEqual(expect.any(String));
    }

    expect(gateway.createPending).toHaveBeenCalledTimes(1);

    expect((gateway.createPending.mock.calls[0][0] as any).user.id).toBe(
      'user-1',
    );

    expect(gateway.uploadMultipartFromPath).toHaveBeenCalledTimes(1);
    expect(gateway.publishProcessingEvent).not.toHaveBeenCalled();

    expect(gateway.updateStatus).toHaveBeenCalledTimes(1);
    expect(gateway.updateStatus).toHaveBeenCalledWith({
      videoId: expect.any(String),
      status: 'ERROR',
      errorMessage: 's3_fail',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'upload_videos.update_status.failed',
      expect.objectContaining({
        userId: 'user-1',
        errorMessage: 's3_fail',
        updateErrorMessage: 'update_fail',
      }),
    );

    expect(unlink).toHaveBeenCalledWith('/tmp/file-1');
  });

  test('when flow fails AFTER createPending and updateStatus succeeds, it logs update_status.set_error', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();
    const usecase = new UploadVideos(gateway, cfg, logger as any);

    gateway.uploadMultipartFromPath.mockRejectedValueOnce(new Error('s3_fail'));
    gateway.updateStatus.mockResolvedValueOnce(true);

    const res = await usecase.execute({
      user,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 123,
          tempFilePath: '/tmp/file-1',
        },
      ],
      validate: jest.fn(),
    });

    expect(res.items[0].ok).toBe(false);

    expect(logger.warn).toHaveBeenCalledWith(
      'upload_videos.update_status.set_error',
      expect.objectContaining({
        userId: 'user-1',
        videoId: expect.any(String),
        errorMessage: 's3_fail',
      }),
    );

    expect(gateway.createPending).toHaveBeenCalledTimes(1);
    expect(gateway.updateStatus).toHaveBeenCalledTimes(1);
  });

  test('logs temp_file.delete_failed when unlink fails (covers unlink catch)', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();
    const usecase = new UploadVideos(gateway, cfg, logger as any);

    const validate = jest.fn(() => {
      throw new Error('invalid_file');
    });

    (unlink as unknown as jest.Mock).mockRejectedValueOnce(
      new Error('unlink_fail'),
    );

    await usecase.execute({
      user,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 123,
          tempFilePath: '/tmp/file-2',
        },
      ],
      validate,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'upload_videos.temp_file.delete_failed',
      expect.objectContaining({
        userId: 'user-1',
        videoId: expect.any(String),
        tempFilePath: '/tmp/file-2',
        unlinkErrorMessage: 'unlink_fail',
      }),
    );
  });

  test('logs temp_file.deleted when unlink succeeds (covers finally success branch / linha do deleted)', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();
    const usecase = new UploadVideos(gateway, cfg, logger as any);

    (unlink as unknown as jest.Mock).mockResolvedValueOnce(undefined);

    await usecase.execute({
      user,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 123,
          tempFilePath: '/tmp/file-success-unlink',
        },
      ],
      validate: jest.fn(() => {
        throw new Error('invalid_file');
      }),
    });

    expect(unlink).toHaveBeenCalledWith('/tmp/file-success-unlink');

    expect(logger.info).toHaveBeenCalledWith(
      'upload_videos.temp_file.deleted',
      expect.objectContaining({
        userId: 'user-1',
        videoId: expect.any(String),
        tempFilePath: '/tmp/file-success-unlink',
      }),
    );
  });

  test('happy path logs and returns pending item (and publishes event with user props)', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();
    const usecase = new UploadVideos(gateway, cfg, logger as any);

    const res = await usecase.execute({
      user,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 123,
          tempFilePath: '/tmp/file-1',
        },
      ],
      validate: jest.fn(),
    });

    expect(res.items).toHaveLength(1);
    const item = res.items[0];

    expect(item.ok).toBe(true);
    if (item.ok) {
      expect(item.status).toBe('PENDING');
      expect(item.videoId).toEqual(expect.any(String));
      expect(item.inputKey).toContain('user-1-');
      expect(item.inputKey).toContain('-source.mp4');
      expect(item.outputZipKey).toContain('user-1-');
      expect(item.outputZipKey).toContain('-processed.zip');
    }

    expect(gateway.createPending).toHaveBeenCalledTimes(1);
    expect(gateway.uploadMultipartFromPath).toHaveBeenCalledTimes(1);
    expect(gateway.publishProcessingEvent).toHaveBeenCalledTimes(1);

    expect(gateway.publishProcessingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: 'user-1', email: 'u@x.com' }),
        event: 'VIDEO_PENDING',
      }),
    );

    expect(gateway.updateStatus).not.toHaveBeenCalled();
    expect(unlink).toHaveBeenCalledWith('/tmp/file-1');
  });

  test('when validate throws a non-Error, it uses upload_failed and logs without stack', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();
    const usecase = new UploadVideos(gateway, cfg, logger as any);

    const validate = jest.fn(() => {
      throw 'nope';
    });

    const res = await usecase.execute({
      user,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 123,
          tempFilePath: '/tmp/file-non-error-1',
        },
      ],
      validate,
    });

    expect(res.items[0].ok).toBe(false);
    if (!res.items[0].ok) {
      expect(res.items[0].errorMessage).toBe('upload_failed');
    }

    const failedCall = logger.error.mock.calls.find(
      (c) => c[0] === 'upload_videos.process_one.failed',
    );
    expect(failedCall).toBeTruthy();

    const meta = failedCall![1] ?? {};
    expect(meta).toHaveProperty('errorMessage', 'upload_failed');
    expect(meta).not.toHaveProperty('stack');

    expect(gateway.updateStatus).not.toHaveBeenCalled();
  });

  test('when updateStatus rejects with non-Error, it logs update_status_failed and without updateStack', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();
    const usecase = new UploadVideos(gateway, cfg, logger as any);

    gateway.uploadMultipartFromPath.mockRejectedValueOnce(new Error('s3_fail'));
    gateway.updateStatus.mockRejectedValueOnce('nope');

    await usecase.execute({
      user,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 123,
          tempFilePath: '/tmp/file-non-error-2',
        },
      ],
      validate: jest.fn(),
    });

    const call = logger.error.mock.calls.find(
      (c) => c[0] === 'upload_videos.update_status.failed',
    );
    expect(call).toBeTruthy();

    const meta = call![1] ?? {};
    expect(meta).toHaveProperty('updateErrorMessage', 'update_status_failed');
    expect(meta).not.toHaveProperty('updateStack');
  });

  test('when unlink rejects with non-Error, it logs unlink_failed and without unlinkStack', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();
    const usecase = new UploadVideos(gateway, cfg, logger as any);

    (unlink as unknown as jest.Mock).mockRejectedValueOnce('nope');

    await usecase.execute({
      user,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 123,
          tempFilePath: '/tmp/file-non-error-3',
        },
      ],
      validate: jest.fn(() => {
        throw new Error('invalid_file');
      }),
    });

    const call = logger.warn.mock.calls.find(
      (c) => c[0] === 'upload_videos.temp_file.delete_failed',
    );
    expect(call).toBeTruthy();

    const meta = call![1] ?? {};
    expect(meta).toHaveProperty('unlinkErrorMessage', 'unlink_failed');
    expect(meta).not.toHaveProperty('unlinkStack');
  });
});
