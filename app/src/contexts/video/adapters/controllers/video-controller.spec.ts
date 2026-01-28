import { VideoController } from './video-controller';
import type { VideoDataSource } from 'src/interfaces/video-data-source';
import type { VideoGateway } from '../../application/gateways/video-gateway';

jest.mock('../../application/usecases/upload-videos', () => ({ UploadVideos: jest.fn() }));
jest.mock('../../application/usecases/list-user-videos', () => ({ ListUserVideos: jest.fn() }));
jest.mock('../../application/usecases/get-processed-video', () => ({ GetProcessedVideo: jest.fn() }));
jest.mock('../../application/usecases/update-video-status', () => ({ UpdateVideoStatus: jest.fn() }));

jest.mock('../presenters/upload-videos.presenter', () => ({
  UploadVideosPresenter: { toJSON: jest.fn() },
}));
jest.mock('../presenters/list-videos.presenter', () => ({
  ListVideosPresenter: { toJSON: jest.fn() },
}));
jest.mock('../presenters/download-processed-zip.presenter', () => ({
  DownloadProcessedZipPresenter: { toJSON: jest.fn() },
}));

import { UploadVideos } from '../../application/usecases/upload-videos';
import { ListUserVideos } from '../../application/usecases/list-user-videos';
import { GetProcessedVideo } from '../../application/usecases/get-processed-video';
import { UpdateVideoStatus } from '../../application/usecases/update-video-status';

import { UploadVideosPresenter } from '../presenters/upload-videos.presenter';
import { ListVideosPresenter } from '../presenters/list-videos.presenter';
import { DownloadProcessedZipPresenter } from '../presenters/download-processed-zip.presenter';

type CtorMock = jest.Mock;

type Logger = {
  log: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

function makeGateway(): jest.Mocked<VideoGateway> {
  return {
    createPending: jest.fn(),
    listByUserId: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    uploadMultipartFromPath: jest.fn(),
    presignGetObject: jest.fn(),
    publishProcessingEvent: jest.fn(),
  };
}

function makeLogger(): jest.Mocked<Logger> {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('VideoController', () => {
  const UploadVideosCtor = UploadVideos as unknown as CtorMock;
  const ListUserVideosCtor = ListUserVideos as unknown as CtorMock;
  const GetProcessedVideoCtor = GetProcessedVideo as unknown as CtorMock;
  const UpdateVideoStatusCtor = UpdateVideoStatus as unknown as CtorMock;

  const uploadPresenter = UploadVideosPresenter as unknown as { toJSON: jest.Mock };
  const listPresenter = ListVideosPresenter as unknown as { toJSON: jest.Mock };
  const downloadPresenter = DownloadProcessedZipPresenter as unknown as { toJSON: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upload: instancia UploadVideos com cfg + logger e retorna presenter', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const ds: VideoDataSource = {
      gateway,
      config: { inputBucket: 'in-bucket', outputBucket: 'out-bucket',maxVideoBytes:104857600 },
      logger: logger as never,
    };

    const executeMock = jest.fn().mockResolvedValue({
      items: [
        { ok: true, videoId: 'v1', inputKey: 'k', outputZipKey: 'z', status: 'PENDING' },
      ],
    });

    UploadVideosCtor.mockImplementation(() => ({ execute: executeMock }));
    uploadPresenter.toJSON.mockReturnValue({ items: [{ ok: true }] });

    const controller = new VideoController(ds);

    const validate = jest.fn();

    const res = await controller.upload(
      'u1',
      [
        {
          originalFileName: 'a.mp4',
          contentType: 'video/mp4',
          size: 10,
          tempFilePath: '/tmp/a.mp4',
        },
      ],
      validate,
    );

    expect(UploadVideosCtor).toHaveBeenCalledWith(
      gateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      ds.logger,
    );

    expect(executeMock).toHaveBeenCalledWith({
      userId: 'u1',
      files: [
        {
          originalFileName: 'a.mp4',
          contentType: 'video/mp4',
          size: 10,
          tempFilePath: '/tmp/a.mp4',
        },
      ],
      validate,
    });

    expect(uploadPresenter.toJSON).toHaveBeenCalled();
    expect(res).toEqual({ items: [{ ok: true }] });
  });

  it('list: instancia ListUserVideos com logger e retorna presenter', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const ds: VideoDataSource = {
      gateway,
      config: { inputBucket: 'in-bucket', outputBucket: 'out-bucket',maxVideoBytes:104857600 },
      logger: logger as never,
    };

    const executeMock = jest.fn().mockResolvedValue({ videos: [{ videoId: 'v1' }] });

    ListUserVideosCtor.mockImplementation(() => ({ execute: executeMock }));
    listPresenter.toJSON.mockReturnValue({ videos: [{ videoId: 'v1' }] });

    const controller = new VideoController(ds);

    const res = await controller.list('u1');

    expect(ListUserVideosCtor).toHaveBeenCalledWith(gateway, ds.logger);
    expect(executeMock).toHaveBeenCalledWith('u1');
    expect(listPresenter.toJSON).toHaveBeenCalledWith([{ videoId: 'v1' }]);
    expect(res).toEqual({ videos: [{ videoId: 'v1' }] });
  });

  it('downloadProcessedZip: instancia GetProcessedVideo com outputBucket + logger e retorna presenter', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const ds: VideoDataSource = {
      gateway,
      config: { inputBucket: 'in-bucket', outputBucket: 'out-bucket',maxVideoBytes:104857600 },
      logger: logger as never,
    };

    const executeMock = jest.fn().mockResolvedValue({
      downloadUrl: 'http://signed',
      bucket: 'out-bucket',
      key: 'u1-v1-processed.zip',
    });

    GetProcessedVideoCtor.mockImplementation(() => ({ execute: executeMock }));
    downloadPresenter.toJSON.mockReturnValue({ downloadUrl: 'http://signed' });

    const controller = new VideoController(ds);

    const res = await controller.downloadProcessedZip('u1', 'v1');

    expect(GetProcessedVideoCtor).toHaveBeenCalledWith(gateway, 'out-bucket', ds.logger);
    expect(executeMock).toHaveBeenCalledWith({ userId: 'u1', videoId: 'v1' });

    expect(downloadPresenter.toJSON).toHaveBeenCalled();
    expect(res).toEqual({ downloadUrl: 'http://signed' });
  });

  it('updateStatusFromEvent: instancia UpdateVideoStatus com logger', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const ds: VideoDataSource = {
      gateway,
      config: { inputBucket: 'in-bucket', outputBucket: 'out-bucket',maxVideoBytes:104857600 },
      logger: logger as never,
    };

    const executeMock = jest.fn().mockResolvedValue({ ok: true });
    UpdateVideoStatusCtor.mockImplementation(() => ({ execute: executeMock }));

    const controller = new VideoController(ds);

    const res = await controller.updateStatusFromEvent({ videoId: 'v1', status: 'SUCCEEDED' });

    expect(UpdateVideoStatusCtor).toHaveBeenCalledWith(gateway, ds.logger);
    expect(executeMock).toHaveBeenCalledWith({ videoId: 'v1', status: 'SUCCEEDED' });
    expect(res).toEqual({ ok: true });
  });
});
