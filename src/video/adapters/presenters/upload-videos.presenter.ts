import { UploadResultItem } from 'src/video/application/usecases/upload-videos';

export class UploadVideosPresenter {
  static toJSON(items: UploadResultItem[]) {
    return { items };
  }
}
