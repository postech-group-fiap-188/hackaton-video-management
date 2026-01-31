import { UploadResultItem } from 'src/application/usecases/upload-videos';

export class UploadVideosPresenter {
  static toJSON(items: UploadResultItem[]) {
    return { items };
  }
}
