import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { VideoGateway } from '../gateways/video-gateway';
import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';

export type UploadResultItem =
  | {
      ok: true;
      videoId: string;
      inputKey: string;
      outputZipKey: string;
      status: 'PENDING';
    }
  | {
      ok: false;
      originalFileName: string;
      status: 'ERROR';
      errorMessage: string;
      videoId?: string;
    };

export class UploadVideos {
  constructor(
    private readonly gateway: VideoGateway,
    private readonly cfg: {
      inputBucket: string;
      outputBucket: string;
    },
    private readonly logger: AppLoggerService,
  ) {}

  async execute(input: {
    userId: string;
    files: Array<{
      originalFileName: string;
      contentType: string;
      size: number;
      tempFilePath: string;
    }>;
    validate: (meta: {
      originalFileName: string;
      contentType: string;
      size: number;
    }) => void;
  }): Promise<{ items: UploadResultItem[] }> {
    this.logger.info('upload_videos.execute.start', {
      userId: input.userId,
      filesCount: input.files.length,
    });

    const now = new Date();

    const tasks: Array<Promise<UploadResultItem>> = input.files.map((f) =>
      this.processOne({
        userId: input.userId,
        file: f,
        now,
        validate: input.validate,
      }),
    );

    const items = await Promise.all(tasks);

    this.logger.info('upload_videos.execute.done', {
      userId: input.userId,
      filesCount: input.files.length,
      okCount: items.filter((i) => i.ok).length,
      errorCount: items.filter((i) => !i.ok).length,
    });

    return { items };
  }

  private async processOne(input: {
    userId: string;
    file: {
      originalFileName: string;
      contentType: string;
      size: number;
      tempFilePath: string;
    };
    now: Date;
    validate: (meta: {
      originalFileName: string;
      contentType: string;
      size: number;
    }) => void;
  }): Promise<UploadResultItem> {
    const { file: f } = input;

    const videoId = randomUUID();
    let createdPending = false;

    this.logger.info('upload_videos.process_one.start', {
      userId: input.userId,
      videoId,
      originalFileName: f.originalFileName,
      contentType: f.contentType,
      size: f.size,
    });

    try {
      input.validate({
        originalFileName: f.originalFileName,
        contentType: f.contentType,
        size: f.size,
      });

      this.logger.info('upload_videos.validate.ok', {
        userId: input.userId,
        videoId,
        originalFileName: f.originalFileName,
      });

      const ext = path.extname(f.originalFileName).toLowerCase();
      const inputKey = `${input.userId}-${videoId}-source${ext}`;
      const outputZipKey = `${input.userId}-${videoId}-processed.zip`;

      await this.gateway.createPending({
        id: videoId,
        userId: input.userId,
        inputBucket: this.cfg.inputBucket,
        inputKey,
        originalFileName: f.originalFileName,
        contentType: f.contentType,
        size: f.size,
        errorMessage: undefined,
        createdAt: input.now,
        updatedAt: input.now,
      });

      createdPending = true;

      this.logger.info('upload_videos.create_pending.ok', {
        userId: input.userId,
        videoId,
        inputBucket: this.cfg.inputBucket,
        inputKey,
      });

      await this.gateway.uploadMultipartFromPath({
        bucket: this.cfg.inputBucket,
        key: inputKey,
        filePath: f.tempFilePath,
        contentType: f.contentType,
      });

      this.logger.info('upload_videos.upload_multipart.ok', {
        userId: input.userId,
        videoId,
        bucket: this.cfg.inputBucket,
        key: inputKey,
      });

      await this.gateway.publishProcessingEvent({
        videoId,
        userId: input.userId,
        inputBucket: this.cfg.inputBucket,
        inputKey,
        outputBucket: this.cfg.outputBucket,
        outputZipKey,
        contentType: f.contentType,
        size: f.size,
      });

      this.logger.info('upload_videos.publish_processing_event.ok', {
        userId: input.userId,
        videoId,
        outputBucket: this.cfg.outputBucket,
        outputZipKey,
      });

      this.logger.info('upload_videos.process_one.success', {
        userId: input.userId,
        videoId,
        inputKey,
        outputZipKey,
      });

      return {
        ok: true,
        videoId,
        inputKey,
        outputZipKey,
        status: 'PENDING',
      } as const;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'upload_failed';

      this.logger.error('upload_videos.process_one.failed', {
        userId: input.userId,
        videoId,
        originalFileName: f.originalFileName,
        errorMessage,
        ...(e instanceof Error && e.stack ? { stack: e.stack } : {}),
        createdPending,
      });

      if (createdPending) {
        try {
          await this.gateway.updateStatus({
            videoId,
            status: 'ERROR',
            errorMessage,
          });

          this.logger.warn('upload_videos.update_status.set_error', {
            userId: input.userId,
            videoId,
            errorMessage,
          });
        } catch (updateErr: unknown) {
          const updateErrMsg =
            updateErr instanceof Error
              ? updateErr.message
              : 'update_status_failed';

          this.logger.error('upload_videos.update_status.failed', {
            userId: input.userId,
            videoId,
            errorMessage,
            updateErrorMessage: updateErrMsg,
            ...(updateErr instanceof Error && updateErr.stack
              ? { updateStack: updateErr.stack }
              : {}),
          });
        }
      } else {
        this.logger.warn('upload_videos.update_status.skipped', {
          userId: input.userId,
          videoId,
          reason: 'pending_not_created',
          errorMessage,
        });
      }

      return {
        ok: false,
        originalFileName: f.originalFileName,
        status: 'ERROR',
        errorMessage,
        videoId,
      } as const;
    } finally {
      try {
        await fs.unlink(f.tempFilePath);
        this.logger.info('upload_videos.temp_file.deleted', {
          userId: input.userId,
          videoId,
          tempFilePath: f.tempFilePath,
        });
      } catch (unlinkErr: unknown) {
        const unlinkErrMsg =
          unlinkErr instanceof Error ? unlinkErr.message : 'unlink_failed';

        this.logger.warn('upload_videos.temp_file.delete_failed', {
          userId: input.userId,
          videoId,
          tempFilePath: f.tempFilePath,
          unlinkErrorMessage: unlinkErrMsg,
          ...(unlinkErr instanceof Error && unlinkErr.stack
            ? { unlinkStack: unlinkErr.stack }
            : {}),
        });
      }
    }
  }
}
