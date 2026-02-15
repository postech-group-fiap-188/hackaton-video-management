import { VideoController } from './video-controller';

import { VideoGatewayImpl } from '../gateway/video-gateway-impl';

import { UploadVideos } from '../../application/usecases/upload-videos';
import { ListUserVideos } from '../../application/usecases/list-user-videos';
import { UpdateVideoStatus } from '../../application/usecases/update-video-status';
import { GetProcessedVideo } from '../../application/usecases/get-processed-video';

import { UploadVideosPresenter } from '../presenters/upload-videos.presenter';
import { ListVideosPresenter } from '../presenters/list-videos.presenter';
import { DownloadProcessedZipPresenter } from '../presenters/download-processed-zip.presenter';

jest.mock('../gateway/video-gateway-impl', () => ({
  __esModule: true,
  VideoGatewayImpl: jest.fn(),
}));

jest.mock('../../application/usecases/upload-videos', () => ({
  __esModule: true,
  UploadVideos: jest.fn(),
}));

jest.mock('../../application/usecases/list-user-videos', () => ({
  __esModule: true,
  ListUserVideos: jest.fn(),
}));

jest.mock('../../application/usecases/update-video-status', () => ({
  __esModule: true,
  UpdateVideoStatus: jest.fn(),
}));

jest.mock('../../application/usecases/get-processed-video', () => ({
  __esModule: true,
  GetProcessedVideo: jest.fn(),
}));

jest.mock('../presenters/upload-videos.presenter', () => ({
  __esModule: true,
  UploadVideosPresenter: { toJSON: jest.fn() },
}));

jest.mock('../presenters/list-videos.presenter', () => ({
  __esModule: true,
  ListVideosPresenter: { toJSON: jest.fn() },
}));

jest.mock('../presenters/download-processed-zip.presenter', () => ({
  __esModule: true,
  DownloadProcessedZipPresenter: { toJSON: jest.fn() },
}));

describe('VideoController', () => {
  const ds = {} as any;
  const storage = {} as any;
  const publisher = {} as any;

  const cfg = { inputBucket: 'in-bucket', outputBucket: 'out-bucket' };

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any;

  const user = { id: 'u1', email: 'u1@mail.com', attributes: { a: '1' } } as any;

  const VideoGatewayImplMock = VideoGatewayImpl as unknown as jest.Mock;
  const UploadVideosMock = UploadVideos as unknown as jest.Mock;
  const ListUserVideosMock = ListUserVideos as unknown as jest.Mock;
  const UpdateVideoStatusMock = UpdateVideoStatus as unknown as jest.Mock;
  const GetProcessedVideoMock = GetProcessedVideo as unknown as jest.Mock;

  const uploadPresenterMock = UploadVideosPresenter.toJSON as unknown as jest.Mock;
  const listPresenterMock = ListVideosPresenter.toJSON as unknown as jest.Mock;
  const downloadPresenterMock =
    DownloadProcessedZipPresenter.toJSON as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upload: instancia gateway, instancia usecase e aplica presenter', async () => {
    const gatewayInstance = { gw: true };
    VideoGatewayImplMock.mockImplementation(() => gatewayInstance);

    const execute = jest.fn().mockResolvedValue({
      items: [{ ok: true, videoId: 'v1' }],
    });
    UploadVideosMock.mockImplementation(() => ({ execute }));

    uploadPresenterMock.mockReturnValue({ items: ['mapped'] });

    const sut = new VideoController(ds, storage, publisher, cfg, logger);

    const files = [
      {
        originalFileName: 'a.mp4',
        contentType: 'video/mp4',
        size: 10,
        tempFilePath: '/tmp/a.mp4',
      },
    ];
    const validate = jest.fn();

    const res = await sut.upload(user, files, validate);

    expect(VideoGatewayImplMock).toHaveBeenCalledWith(ds, storage, publisher);
    expect(UploadVideosMock).toHaveBeenCalledWith(
      gatewayInstance,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger,
    );
    expect(execute).toHaveBeenCalledWith({ user, files, validate });
    expect(uploadPresenterMock).toHaveBeenCalledWith([{ ok: true, videoId: 'v1' }]);
    expect(res).toEqual({ items: ['mapped'] });
  });

  it('list: instancia gateway, instancia usecase e aplica presenter', async () => {
    const gatewayInstance = { gw: true };
    VideoGatewayImplMock.mockImplementation(() => gatewayInstance);

    const execute = jest.fn().mockResolvedValue({
      videos: [{ id: 'v1' }, { id: 'v2' }],
    });
    ListUserVideosMock.mockImplementation(() => ({ execute }));

    listPresenterMock.mockReturnValue({ items: ['v1', 'v2'] });

    const sut = new VideoController(ds, storage, publisher, cfg, logger);

    const res = await sut.list(user);

    expect(VideoGatewayImplMock).toHaveBeenCalledWith(ds, storage, publisher);
    expect(ListUserVideosMock).toHaveBeenCalledWith(gatewayInstance, logger);
    expect(execute).toHaveBeenCalledWith(user);
    expect(listPresenterMock).toHaveBeenCalledWith([{ id: 'v1' }, { id: 'v2' }]);
    expect(res).toEqual({ items: ['v1', 'v2'] });
  });

  it('downloadProcessedZip: instancia gateway, instancia usecase e aplica presenter', async () => {
    const gatewayInstance = { gw: true };
    VideoGatewayImplMock.mockImplementation(() => gatewayInstance);

    const execute = jest.fn().mockResolvedValue({
      bucket: 'out-bucket',
      key: 'u1-v1-processed.zip',
      downloadUrl: 'signed-url',
    });
    GetProcessedVideoMock.mockImplementation(() => ({ execute }));

    downloadPresenterMock.mockReturnValue({
      bucket: 'out-bucket',
      key: 'u1-v1-processed.zip',
      downloadUrl: 'signed-url',
    });

    const sut = new VideoController(ds, storage, publisher, cfg, logger);

    const res = await sut.downloadProcessedZip(user, 'v1');

    expect(VideoGatewayImplMock).toHaveBeenCalledWith(ds, storage, publisher);
    expect(GetProcessedVideoMock).toHaveBeenCalledWith(
      gatewayInstance,
      'out-bucket',
      logger,
    );
    expect(execute).toHaveBeenCalledWith({ user, videoId: 'v1' });
    expect(downloadPresenterMock).toHaveBeenCalledWith({
      bucket: 'out-bucket',
      key: 'u1-v1-processed.zip',
      downloadUrl: 'signed-url',
    });
    expect(res).toEqual({
      bucket: 'out-bucket',
      key: 'u1-v1-processed.zip',
      downloadUrl: 'signed-url',
    });
  });

  it('updateStatusFromEvent: instancia gateway, instancia usecase e retorna output', async () => {
    const gatewayInstance = { gw: true };
    VideoGatewayImplMock.mockImplementation(() => gatewayInstance);

    const execute = jest.fn().mockResolvedValue({ updated: true });
    UpdateVideoStatusMock.mockImplementation(() => ({ execute }));

    const sut = new VideoController(ds, storage, publisher, cfg, logger);

    const input = { videoId: 'v1', status: 'ERROR', errorMessage: 'boom' } as any;

    const res = await sut.updateStatusFromEvent(input);

    expect(VideoGatewayImplMock).toHaveBeenCalledWith(ds, storage, publisher);
    expect(UpdateVideoStatusMock).toHaveBeenCalledWith(gatewayInstance, logger);
    expect(execute).toHaveBeenCalledWith(input);
    expect(res).toEqual({ updated: true });
  });
});
