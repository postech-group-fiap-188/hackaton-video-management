import { VideoDataSource } from 'src/interfaces/video-data-source';
import { UploadVideos } from '../../application/usecases/upload-videos';
import { ListUserVideos } from '../../application/usecases/list-user-videos';
import { UpdateVideoStatus } from '../../application/usecases/update-video-status';
import { UploadVideosPresenter } from '../presenters/upload-videos.presenter';
import { ListVideosPresenter } from '../presenters/list-videos.presenter';
import { DownloadProcessedZipPresenter } from '../presenters/download-processed-zip.presenter';
import { GetProcessedVideo } from '../../application/usecases/get-processed-video';

export class VideoController {
  constructor(private readonly ds: VideoDataSource) {}

  async upload(
    userId: string,
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
    const gateway = this.ds.gateway;

    const usecase = new UploadVideos(
      gateway,
      {
        inputBucket: this.ds.config.inputBucket,
        outputBucket: this.ds.config.outputBucket,
      },
      this.ds.logger,
    );

    const out = await usecase.execute({ userId, files, validate });
    return UploadVideosPresenter.toJSON(out.items);
  }

  async list(userId: string) {
    const usecase = new ListUserVideos(this.ds.gateway, this.ds.logger);
    const out = await usecase.execute(userId);
    return ListVideosPresenter.toJSON(out.videos);
  }

  async downloadProcessedZip(userId: string, videoId: string) {
    const usecase = new GetProcessedVideo(
      this.ds.gateway,
      this.ds.config.outputBucket,
      this.ds.logger,
    );

    const out = await usecase.execute({ userId, videoId });
    return DownloadProcessedZipPresenter.toJSON(out);
  }

  async updateStatusFromEvent(input: {
    videoId: string;
    status: 'SUCCEEDED' | 'ERROR';
    errorMessage?: string;
  }) {
    const usecase = new UpdateVideoStatus(this.ds.gateway, this.ds.logger);
    return usecase.execute(input);
  }
}
