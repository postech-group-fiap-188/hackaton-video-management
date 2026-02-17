import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { VideoGateway } from '../gateways/video-gateway';
import { User, type UserProps } from 'src/domain/entities/user';
import { Video } from 'src/domain/entities/video';
import type { AppLogger } from 'src/application/ports/app-logger';
import { VideoStatus } from 'src/domain/enums/video-status';
import { validateVideoFormat } from 'src/infra/api/common/validators/video-format.validator';

const PRESIGNED_EXPIRES_SECONDS = 300;

export type PresignedUploadItem = {
  videoId: string;
  uploadUrl: string;
  expiresIn: number;
  inputKey: string;
  outputZipKey: string;
  user: { id: string; email: string; name?: string };
};

export class GetPresignedUploadUrls {
  constructor(
    private readonly gateway: VideoGateway,
    private readonly cfg: {
      inputBucket: string;
      outputBucket: string;
    },
    private readonly logger: AppLogger,
  ) {}

  async execute(input: {
    user: UserProps;
    files: Array<{ originalFileName: string; contentType: string }>;
  }): Promise<{ items: PresignedUploadItem[] }> {
    const user = User.create(input.user);

    this.logger.info('get_presigned_upload_urls.execute.start', {
      userId: user.id,
      filesCount: input.files.length,
    });

    if (!input.files.length) {
      return { items: [] };
    }

    for (const file of input.files) {
      validateVideoFormat(file.originalFileName, file.contentType);
    }

    const items: PresignedUploadItem[] = [];

    for (const file of input.files) {
      const videoId = randomUUID();
      const ext = path.extname(file.originalFileName).toLowerCase();
      const inputKey = `${user.id}-${videoId}-source${ext}`;
      const outputZipKey = `${user.id}-${videoId}-processed.zip`;

      const now = new Date();
      const pending = new Video(
        user,
        this.cfg.inputBucket,
        inputKey,
        file.originalFileName,
        file.contentType,
        0,
        VideoStatus.PENDING,
        undefined,
        now,
        now,
        videoId,
      );

      await this.gateway.createVideoMetaData(pending);

      const uploadUrl = await this.gateway.presignPutObject({
        bucket: this.cfg.inputBucket,
        key: inputKey,
        contentType: file.contentType,
        expiresInSeconds: PRESIGNED_EXPIRES_SECONDS,
        metadata: {
          'user-id': user.id,
          'user-email': user.email ?? '',
          'user-name': user.name ?? '',
          'original-name': file.originalFileName,
          'output-zip-key': outputZipKey,
          'video-id': videoId,
        },
      });

      items.push({
        videoId,
        uploadUrl,
        expiresIn: PRESIGNED_EXPIRES_SECONDS,
        inputKey,
        outputZipKey,
        user: {
          id: user.id,
          email: user.email ?? '',
          name: user.name,
        },
      });

      this.logger.info('get_presigned_upload_urls.item.ok', {
        userId: user.id,
        videoId,
        inputKey,
      });
    }

    this.logger.info('get_presigned_upload_urls.execute.done', {
      userId: user.id,
      itemsCount: items.length,
    });

    return { items };
  }
}
