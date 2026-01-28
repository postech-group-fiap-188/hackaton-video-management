import { UploadResultItem } from 'src/contexts/video/application/usecases/upload-videos';

export class UploadVideosPresenter {
  static toJSON(items: UploadResultItem[]) {
    return { items };
  }
}
