import type { VideoDataSource } from 'src/interfaces/video-data-source';

import { UploadVideos } from '../../application/usecases/upload-videos';
import { ListUserVideos } from '../../application/usecases/list-user-videos';
import { UpdateVideoStatus } from '../../application/usecases/update-video-status';
import { GetProcessedVideo } from '../../application/usecases/get-processed-video';

import { UploadVideosPresenter } from '../presenters/upload-videos.presenter';
import { ListVideosPresenter } from '../presenters/list-videos.presenter';
import { DownloadProcessedZipPresenter } from '../presenters/download-processed-zip.presenter';
import { UserContextProps } from '../../domain/entities/user-context';
import { VideoStatus } from 'src/domain/enums/video-status';

export class VideoController {
  constructor(private readonly ds: VideoDataSource) {}

  async upload(
    user: UserContextProps,
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
    const usecase = new UploadVideos(
      this.ds.gateway,
      {
        inputBucket: this.ds.config.inputBucket,
        outputBucket: this.ds.config.outputBucket,
      },
      this.ds.logger,
    );

    const out = await usecase.execute({ user, files, validate });
    return UploadVideosPresenter.toJSON(out.items);
  }

  async list(user: UserContextProps) {
    const usecase = new ListUserVideos(this.ds.gateway, this.ds.logger);
    const out = await usecase.execute(user);
    return ListVideosPresenter.toJSON(out.videos);
  }

  async downloadProcessedZip(user: UserContextProps, videoId: string) {
    const usecase = new GetProcessedVideo(
      this.ds.gateway,
      this.ds.config.outputBucket,
      this.ds.logger,
    );

    const out = await usecase.execute({ user, videoId });
    return DownloadProcessedZipPresenter.toJSON(out);
  }

  async updateStatusFromEvent(input: {
    videoId: string;
    status: VideoStatus;
    errorMessage?: string;
  }) {
    const usecase = new UpdateVideoStatus(this.ds.gateway, this.ds.logger);
    return usecase.execute(input);
  }
}
