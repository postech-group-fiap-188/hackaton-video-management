import { VideoController } from './video-controller';
import type { VideoDataSource } from 'src/interfaces/video-data-source';
import type { VideoGateway } from '../../application/gateways/video-gateway';
import type { UserContextProps } from '../../domain/entities/user-context';

jest.mock('../../application/usecases/upload-videos', () => ({
  UploadVideos: jest.fn(),
}));
jest.mock('../../application/usecases/list-user-videos', () => ({
  ListUserVideos: jest.fn(),
}));
jest.mock('../../application/usecases/get-processed-video', () => ({
  GetProcessedVideo: jest.fn(),
}));
jest.mock('../../application/usecases/update-video-status', () => ({
  UpdateVideoStatus: jest.fn(),
}));

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
import { VideoStatus } from 'src/video/domain/enums/video-status';

type CtorMock = jest.Mock;

type Logger = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

function makeGateway(): jest.Mocked<VideoGateway> {
  return {
    createPending: jest.fn(),
    listByUser: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    uploadMultipartFromPath: jest.fn(),
    presignGetObject: jest.fn(),
    publishProcessingEvent: jest.fn(),
  } as any;
}

function makeLogger(): jest.Mocked<Logger> {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

const makeUser = (id = 'u1'): UserContextProps => ({
  id,
  email: `${id}@mail.com`,
});

describe('VideoController', () => {
  const UploadVideosCtor = UploadVideos as unknown as CtorMock;
  const ListUserVideosCtor = ListUserVideos as unknown as CtorMock;
  const GetProcessedVideoCtor = GetProcessedVideo as unknown as CtorMock;
  const UpdateVideoStatusCtor = UpdateVideoStatus as unknown as CtorMock;

  const uploadPresenter = UploadVideosPresenter as unknown as {
    toJSON: jest.Mock;
  };
  const listPresenter = ListVideosPresenter as unknown as { toJSON: jest.Mock };
  const downloadPresenter = DownloadProcessedZipPresenter as unknown as {
    toJSON: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upload: instancia UploadVideos com cfg + logger e retorna presenter', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();
    const user = makeUser('u1');

    const ds: VideoDataSource = {
      gateway,
      config: {
        inputBucket: 'in-bucket',
        outputBucket: 'out-bucket',
        maxVideoBytes: 104857600,
      },
      logger: logger as never,
    };

    const executeMock = jest.fn().mockResolvedValue({
      items: [
        {
          ok: true,
          videoId: 'v1',
          inputKey: 'k',
          outputZipKey: 'z',
          status: VideoStatus.PENDING,
        },
      ],
    });

    UploadVideosCtor.mockImplementation(() => ({ execute: executeMock }));
    uploadPresenter.toJSON.mockReturnValue({ items: [{ ok: true }] });

    const controller = new VideoController(ds);

    const validate = jest.fn();

    const res = await controller.upload(
      user,
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
      user,
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
    const user = makeUser('u1');

    const ds: VideoDataSource = {
      gateway,
      config: {
        inputBucket: 'in-bucket',
        outputBucket: 'out-bucket',
        maxVideoBytes: 104857600,
      },
      logger: logger as never,
    };

    const executeMock = jest
      .fn()
      .mockResolvedValue({ videos: [{ videoId: 'v1' }] });

    ListUserVideosCtor.mockImplementation(() => ({ execute: executeMock }));
    listPresenter.toJSON.mockReturnValue({ videos: [{ videoId: 'v1' }] });

    const controller = new VideoController(ds);

    const res = await controller.list(user);

    expect(ListUserVideosCtor).toHaveBeenCalledWith(gateway, ds.logger);

    expect(executeMock).toHaveBeenCalledWith(user);

    expect(listPresenter.toJSON).toHaveBeenCalledWith([{ videoId: 'v1' }]);
    expect(res).toEqual({ videos: [{ videoId: 'v1' }] });
  });

  it('downloadProcessedZip: instancia GetProcessedVideo com outputBucket + logger e retorna presenter', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();
    const user = makeUser('u1');

    const ds: VideoDataSource = {
      gateway,
      config: {
        inputBucket: 'in-bucket',
        outputBucket: 'out-bucket',
        maxVideoBytes: 104857600,
      },
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

    const res = await controller.downloadProcessedZip(user, 'v1');

    expect(GetProcessedVideoCtor).toHaveBeenCalledWith(
      gateway,
      'out-bucket',
      ds.logger,
    );

    expect(executeMock).toHaveBeenCalledWith({ user, videoId: 'v1' });

    expect(downloadPresenter.toJSON).toHaveBeenCalled();
    expect(res).toEqual({ downloadUrl: 'http://signed' });
  });

  it('updateStatusFromEvent: instancia UpdateVideoStatus com logger', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const ds: VideoDataSource = {
      gateway,
      config: {
        inputBucket: 'in-bucket',
        outputBucket: 'out-bucket',
        maxVideoBytes: 104857600,
      },
      logger: logger as never,
    };

    const executeMock = jest.fn().mockResolvedValue({ ok: true });
    UpdateVideoStatusCtor.mockImplementation(() => ({ execute: executeMock }));

    const controller = new VideoController(ds);

    const res = await controller.updateStatusFromEvent({
      videoId: 'v1',
      status: VideoStatus.SUCCEEDED,
    });

    expect(UpdateVideoStatusCtor).toHaveBeenCalledWith(gateway, ds.logger);
    expect(executeMock).toHaveBeenCalledWith({
      videoId: 'v1',
      status: VideoStatus.SUCCEEDED,
    });
    expect(res).toEqual({ ok: true });
  });
});