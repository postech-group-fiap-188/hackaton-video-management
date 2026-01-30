import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import path from 'path';

import type { VideoGateway } from '../gateways/video-gateway';
import {
  UserContext,
  UserContextProps,
} from 'src/video/domain/entities/user-context';
import type { AppLogger } from 'src/video/application/ports/app-logger';
import { VideoStatus } from 'src/video/domain/enums/video-status';

export type UploadResultItem =
  | {
      ok: true;
      videoId: string;
      inputKey: string;
      outputZipKey: string;
      status: VideoStatus.PENDING;
    }
  | {
      ok: false;
      originalFileName: string;
      status: VideoStatus.ERROR;
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
    private readonly logger: AppLogger,
  ) {}

  async execute(input: {
    user: UserContextProps;
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
    const user = UserContext.create(input.user);

    this.logger.info('upload_videos.execute.start', {
      userId: user.id,
      filesCount: input.files.length,
    });

    const now = new Date();

    const tasks: Array<Promise<UploadResultItem>> = input.files.map((f) =>
      this.processOne({
        user,
        file: f,
        now,
        validate: input.validate,
      }),
    );

    const items = await Promise.all(tasks);

    this.logger.info('upload_videos.execute.done', {
      userId: user.id,
      filesCount: input.files.length,
      okCount: items.filter((i) => i.ok).length,
      errorCount: items.filter((i) => !i.ok).length,
    });

    return { items };
  }

  private async processOne(input: {
    user: UserContext;
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
    const { file: f, user } = input;

    const videoId = randomUUID();
    let createdPending = false;

    this.logger.info('upload_videos.process_one.start', {
      userId: user.id,
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
        userId: user.id,
        videoId,
        originalFileName: f.originalFileName,
      });

      const ext = path.extname(f.originalFileName).toLowerCase();
      const inputKey = `${user.id}-${videoId}-source${ext}`;
      const outputZipKey = `${user.id}-${videoId}-processed.zip`;

      await this.gateway.createPending({
        id: videoId,
        user,
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
        userId: user.id,
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
        userId: user.id,
        videoId,
        bucket: this.cfg.inputBucket,
        key: inputKey,
      });

      await this.gateway.publishProcessingEvent({
        videoId,
        user: user.toProps(),
        inputBucket: this.cfg.inputBucket,
        inputKey,
        outputBucket: this.cfg.outputBucket,
        outputZipKey,
        contentType: f.contentType,
        size: f.size,
        originalFileName: f.originalFileName,
        event: 'VIDEO_PENDING',
      });

      this.logger.info('upload_videos.publish_processing_event.ok', {
        userId: user.id,
        videoId,
        outputBucket: this.cfg.outputBucket,
        outputZipKey,
      });

      this.logger.info('upload_videos.process_one.success', {
        userId: user.id,
        videoId,
        inputKey,
        outputZipKey,
      });

      return {
        ok: true,
        videoId,
        inputKey,
        outputZipKey,
        status: VideoStatus.PENDING,
      } as const;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'upload_failed';

      this.logger.error('upload_videos.process_one.failed', {
        userId: user.id,
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
            status: VideoStatus.ERROR,
            errorMessage,
          });

          this.logger.warn('upload_videos.update_status.set_error', {
            userId: user.id,
            videoId,
            errorMessage,
          });
        } catch (updateErr: unknown) {
          const updateErrMsg =
            updateErr instanceof Error
              ? updateErr.message
              : 'update_status_failed';

          this.logger.error('upload_videos.update_status.failed', {
            userId: user.id,
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
          userId: user.id,
          videoId,
          reason: 'pending_not_created',
          errorMessage,
        });
      }

      return {
        ok: false,
        originalFileName: f.originalFileName,
        status: VideoStatus.ERROR,
        errorMessage,
        videoId,
      } as const;
    } finally {
      try {
        await unlink(f.tempFilePath);
        this.logger.info('upload_videos.temp_file.deleted', {
          userId: user.id,
          videoId,
          tempFilePath: f.tempFilePath,
        });
      } catch (unlinkErr: unknown) {
        const unlinkErrMsg =
          unlinkErr instanceof Error ? unlinkErr.message : 'unlink_failed';

        this.logger.warn('upload_videos.temp_file.delete_failed', {
          userId: user.id,
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