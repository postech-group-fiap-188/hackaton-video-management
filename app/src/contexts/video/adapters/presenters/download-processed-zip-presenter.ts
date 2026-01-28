export class DownloadProcessedZipPresenter {
  static toJSON(input: { downloadUrl: string; bucket: string; key: string }) {
    return input;
  }
}
