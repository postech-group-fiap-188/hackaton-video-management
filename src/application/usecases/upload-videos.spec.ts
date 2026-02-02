jest.mock('node:crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('node:fs/promises', () => ({ unlink: jest.fn() }));

import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';

import { UploadVideos } from './upload-videos';
import { VideoStatus } from 'src/domain/enums/video-status';
import type { VideoGateway } from '../gateways/video-gateway';

type GatewayMock = {
  createVideoMetaData: jest.Mock;
  uploadMultipartFromPath: jest.Mock;
  publishProcessingEvent: jest.Mock;
  updateStatus: jest.Mock;
};

const makeGateway = (): GatewayMock => ({
  createVideoMetaData: jest.fn(),
  uploadMultipartFromPath: jest.fn(),
  publishProcessingEvent: jest.fn(),
  updateStatus: jest.fn(),
});

const makeLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('UploadVideos (100% coverage)', () => {
  const randomUUIDMock = randomUUID as unknown as jest.Mock;
  const unlinkMock = unlink as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('execute: processa arquivos, retorna itens e loga contadores ok/error', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    randomUUIDMock.mockReturnValueOnce('v1').mockReturnValueOnce('v2');
    unlinkMock.mockResolvedValue(undefined);

    gateway.createVideoMetaData.mockResolvedValue(undefined);
    gateway.uploadMultipartFromPath.mockResolvedValue(undefined);
    gateway.publishProcessingEvent.mockResolvedValue(undefined);

    const usecase = new UploadVideos(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as any,
    );

    const validate = jest.fn((m: any) => {
      if (m.originalFileName === 'bad.mp4') throw new Error('bad');
    });

    const res = await usecase.execute({
      user: {
        id: 'u1',
        email: 'u1@mail.com',
        attributes: { 'is-admin': 'true' },
      } as any,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 10,
          tempFilePath: '/tmp/a.mp4',
        },
        {
          originalFileName: 'bad.mp4',
          contentType: 'video/mp4',
          size: 10,
          tempFilePath: '/tmp/b.mp4',
        },
      ],
      validate,
    });

    expect(res.items).toHaveLength(2);

    expect(res.items[0]).toEqual({
      ok: true,
      videoId: 'v1',
      inputKey: 'u1-v1-source.mp4',
      outputZipKey: 'u1-v1-processed.zip',
      status: VideoStatus.PENDING,
    });

    expect(res.items[1]).toEqual({
      ok: false,
      originalFileName: 'bad.mp4',
      status: VideoStatus.ERROR,
      errorMessage: 'bad',
      videoId: 'v2',
    });

    expect(logger.info).toHaveBeenCalledWith(
      'upload_videos.execute.start',
      expect.objectContaining({ userId: 'u1', filesCount: 2 }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      'upload_videos.execute.done',
      expect.objectContaining({
        userId: 'u1',
        filesCount: 2,
        okCount: 1,
        errorCount: 1,
      }),
    );

    expect(logger.warn).toHaveBeenCalledWith(
      'upload_videos.update_status.skipped',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v2',
        reason: 'pending_not_created',
        errorMessage: 'bad',
      }),
    );

    expect(unlinkMock).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('validate joga string: retorna upload_failed, pula updateStatus e unlink falha com string', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    randomUUIDMock.mockReturnValueOnce('v1');
    unlinkMock.mockRejectedValueOnce('nope');

    const usecase = new UploadVideos(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as any,
    );

    const validate = jest.fn(() => {
      throw 'x';
    });

    const res = await usecase.execute({
      user: { id: 'u1', email: 'u1@mail.com', attributes: {} } as any,
      files: [
        {
          originalFileName: 'x.mp4',
          contentType: 'video/mp4',
          size: 10,
          tempFilePath: '/tmp/x.mp4',
        },
      ],
      validate,
    });

    expect(res).toEqual({
      items: [
        {
          ok: false,
          originalFileName: 'x.mp4',
          status: VideoStatus.ERROR,
          errorMessage: 'upload_failed',
          videoId: 'v1',
        },
      ],
    });

    expect(gateway.createVideoMetaData).not.toHaveBeenCalled();
    expect(gateway.updateStatus).not.toHaveBeenCalled();

    expect(logger.warn).toHaveBeenCalledWith(
      'upload_videos.update_status.skipped',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        reason: 'pending_not_created',
        errorMessage: 'upload_failed',
      }),
    );

    expect(logger.warn).toHaveBeenCalledWith(
      'upload_videos.temp_file.delete_failed',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        tempFilePath: '/tmp/x.mp4',
        unlinkErrorMessage: 'unlink_failed',
      }),
    );
  });

  it('falha depois de criar pending: tenta updateStatus (ok) e unlink falha com Error', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    randomUUIDMock.mockReturnValueOnce('v1');
    unlinkMock.mockRejectedValueOnce(new Error('UNLINK_FAIL'));

    gateway.createVideoMetaData.mockResolvedValue(undefined);
    gateway.uploadMultipartFromPath.mockRejectedValueOnce(new Error('S3_FAIL'));
    gateway.updateStatus.mockResolvedValueOnce(true);

    const usecase = new UploadVideos(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as any,
    );

    const validate = jest.fn();

    const res = await usecase.execute({
      user: { id: 'u1', email: 'u1@mail.com', attributes: {} } as any,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 10,
          tempFilePath: '/tmp/a.mp4',
        },
      ],
      validate,
    });

    expect(res.items[0]).toEqual({
      ok: false,
      originalFileName: 'video.mp4',
      status: VideoStatus.ERROR,
      errorMessage: 'S3_FAIL',
      videoId: 'v1',
    });

    expect(gateway.updateStatus).toHaveBeenCalledWith({
      videoId: 'v1',
      status: VideoStatus.ERROR,
      errorMessage: 'S3_FAIL',
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'upload_videos.update_status.set_error',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        errorMessage: 'S3_FAIL',
      }),
    );

    expect(logger.warn).toHaveBeenCalledWith(
      'upload_videos.temp_file.delete_failed',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        tempFilePath: '/tmp/a.mp4',
        unlinkErrorMessage: 'UNLINK_FAIL',
        unlinkStack: expect.any(String),
      }),
    );
  });

  it('falha ao publicar evento: updateStatus falha com Error e loga updateStack', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    randomUUIDMock.mockReturnValueOnce('v1');
    unlinkMock.mockResolvedValueOnce(undefined);

    gateway.createVideoMetaData.mockResolvedValue(undefined);
    gateway.uploadMultipartFromPath.mockResolvedValue(undefined);
    gateway.publishProcessingEvent.mockRejectedValueOnce(new Error('SNS_FAIL'));
    gateway.updateStatus.mockRejectedValueOnce(new Error('UPDATE_FAIL'));

    const usecase = new UploadVideos(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as any,
    );

    const validate = jest.fn();

    const res = await usecase.execute({
      user: { id: 'u1', email: 'u1@mail.com', attributes: {} } as any,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 10,
          tempFilePath: '/tmp/a.mp4',
        },
      ],
      validate,
    });

    expect(res.items[0]).toEqual({
      ok: false,
      originalFileName: 'video.mp4',
      status: VideoStatus.ERROR,
      errorMessage: 'SNS_FAIL',
      videoId: 'v1',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'upload_videos.update_status.failed',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        errorMessage: 'SNS_FAIL',
        updateErrorMessage: 'UPDATE_FAIL',
        updateStack: expect.any(String),
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      'upload_videos.temp_file.deleted',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        tempFilePath: '/tmp/a.mp4',
      }),
    );
  });

  it('updateStatus falha com valor não-Error: update_status_failed', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    randomUUIDMock.mockReturnValueOnce('v1');
    unlinkMock.mockResolvedValueOnce(undefined);

    gateway.createVideoMetaData.mockResolvedValue(undefined);
    gateway.uploadMultipartFromPath.mockRejectedValueOnce(new Error('S3_FAIL'));
    gateway.updateStatus.mockRejectedValueOnce('nope');

    const usecase = new UploadVideos(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as any,
    );

    const validate = jest.fn();

    const res = await usecase.execute({
      user: { id: 'u1', email: 'u1@mail.com', attributes: {} } as any,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 10,
          tempFilePath: '/tmp/a.mp4',
        },
      ],
      validate,
    });

    expect(res.items[0]).toEqual({
      ok: false,
      originalFileName: 'video.mp4',
      status: VideoStatus.ERROR,
      errorMessage: 'S3_FAIL',
      videoId: 'v1',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'upload_videos.update_status.failed',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        errorMessage: 'S3_FAIL',
        updateErrorMessage: 'update_status_failed',
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      'upload_videos.temp_file.deleted',
      expect.objectContaining({
        userId: 'u1',
        videoId: 'v1',
        tempFilePath: '/tmp/a.mp4',
      }),
    );
  });

  it('Error sem stack: não inclui stack/updateStack/unlinkStack nos logs', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    randomUUIDMock.mockReturnValueOnce('v1');

    const s3Err = new Error('S3_FAIL');
    s3Err.stack = undefined;

    const updErr = new Error('UPDATE_FAIL');
    updErr.stack = undefined;

    const unlinkErr = new Error('UNLINK_FAIL');
    unlinkErr.stack = undefined;

    gateway.createVideoMetaData.mockResolvedValue(undefined);
    gateway.uploadMultipartFromPath.mockRejectedValueOnce(s3Err);
    gateway.updateStatus.mockRejectedValueOnce(updErr);

    unlinkMock.mockRejectedValueOnce(unlinkErr);

    const usecase = new UploadVideos(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as any,
    );

    const validate = jest.fn();

    const res = await usecase.execute({
      user: { id: 'u1', email: 'u1@mail.com', attributes: {} } as any,
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 10,
          tempFilePath: '/tmp/a.mp4',
        },
      ],
      validate,
    });

    expect(res.items[0]).toEqual({
      ok: false,
      originalFileName: 'video.mp4',
      status: VideoStatus.ERROR,
      errorMessage: 'S3_FAIL',
      videoId: 'v1',
    });

    const processFailedCall = (logger.error as jest.Mock).mock.calls.find(
      (c) => c[0] === 'upload_videos.process_one.failed',
    );
    expect(processFailedCall?.[1]?.stack).toBeUndefined();

    const updateFailedCall = (logger.error as jest.Mock).mock.calls.find(
      (c) => c[0] === 'upload_videos.update_status.failed',
    );
    expect(updateFailedCall?.[1]?.updateStack).toBeUndefined();
    expect(updateFailedCall?.[1]?.updateErrorMessage).toBe('UPDATE_FAIL');

    const unlinkFailedCall = (logger.warn as jest.Mock).mock.calls.find(
      (c) => c[0] === 'upload_videos.temp_file.delete_failed',
    );
    expect(unlinkFailedCall?.[1]?.unlinkStack).toBeUndefined();
    expect(unlinkFailedCall?.[1]?.unlinkErrorMessage).toBe('UNLINK_FAIL');
  });
});
