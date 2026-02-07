import { VideoRepositoryDataSource } from 'src/interfaces/video-repository-data-source';
import { VideoStorageProvider } from 'src/interfaces/video-storage-provider';
import { VideoProcessingPublisher } from 'src/interfaces/video-processing-publisher';

import { VideoGatewayImpl } from '../gateway/video-gateway-impl';

import { UploadVideos } from '../../application/usecases/upload-videos';
import { ListUserVideos } from '../../application/usecases/list-user-videos';
import { UpdateVideoStatus } from '../../application/usecases/update-video-status';
import { GetProcessedVideo } from '../../application/usecases/get-processed-video';

import { UploadVideosPresenter } from '../presenters/upload-videos.presenter';
import { ListVideosPresenter } from '../presenters/list-videos.presenter';
import { DownloadProcessedZipPresenter } from '../presenters/download-processed-zip.presenter';

import type { UserProps } from '../../domain/entities/user';
import type { AppLogger } from 'src/application/ports/app-logger';
import type { VideoStatus } from 'src/domain/enums/video-status';

export class VideoController {
  constructor(
    private readonly videoRepositoryDataSource: VideoRepositoryDataSource,
    private readonly videoStorageProvider: VideoStorageProvider,
    private readonly videoProcessingPublisher: VideoProcessingPublisher,
    private readonly cfg: {
      inputBucket: string;
      outputBucket: string;
    },
    private readonly logger: AppLogger,
  ) {}

  async upload(
    user: UserProps,
    files: Array<{
      originalFileName: string;
      contentType: string;
      size: number;
      tempFilePath: string;
    }>,
    validate: (m: {
      originalFileName: string;
      contentType: string;
      size: number;
    }) => void,
  ) {
    const gateway = new VideoGatewayImpl(
      this.videoRepositoryDataSource,
      this.videoStorageProvider,
      this.videoProcessingPublisher,
    );

    const uploadVideos = new UploadVideos(
      gateway,
      {
        inputBucket: this.cfg.inputBucket,
        outputBucket: this.cfg.outputBucket,
      },
      this.logger,
    );

    const output = await uploadVideos.execute({ user, files, validate });
    return UploadVideosPresenter.toJSON(output.items);
  }

  async list(user: UserProps) {
    const gateway = new VideoGatewayImpl(
      this.videoRepositoryDataSource,
      this.videoStorageProvider,
      this.videoProcessingPublisher,
    );

    const listUserVideos = new ListUserVideos(gateway, this.logger);
    const output = await listUserVideos.execute(user);

    return ListVideosPresenter.toJSON(output.videos);
  }

  async downloadProcessedZip(user: UserProps, videoId: string) {
    const gateway = new VideoGatewayImpl(
      this.videoRepositoryDataSource,
      this.videoStorageProvider,
      this.videoProcessingPublisher,
    );

    const getProcessedVideo = new GetProcessedVideo(
      gateway,
      this.cfg.outputBucket,
      this.logger,
    );

    const output = await getProcessedVideo.execute({ user, videoId });
    return DownloadProcessedZipPresenter.toJSON(output);
  }

  async updateStatusFromEvent(input: {
    videoId: string;
    status: VideoStatus;
    errorMessage?: string;
  }) {
    const gateway = new VideoGatewayImpl(
      this.videoRepositoryDataSource,
      this.videoStorageProvider,
      this.videoProcessingPublisher,
    );

    const updateVideoStatus = new UpdateVideoStatus(gateway, this.logger);
    return updateVideoStatus.execute(input);
  }
}
