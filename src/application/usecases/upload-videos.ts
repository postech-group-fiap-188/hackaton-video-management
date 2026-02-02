import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

import type { VideoGateway } from '../gateways/video-gateway';
import { User, UserProps } from 'src/domain/entities/user-context';
import { Video } from 'src/domain/entities/video';
import type { AppLogger } from 'src/application/ports/app-logger';
import { VideoStatus } from 'src/domain/enums/video-status';

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
    user: UserProps;
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
    const user = User.create(input.user);

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
    user: User;
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

      const pending = new Video(
        user,
        this.cfg.inputBucket,
        inputKey,
        f.originalFileName,
        f.contentType,
        f.size,
        VideoStatus.PENDING,
        undefined,
        input.now,
        input.now,
        videoId,
      );

      await this.gateway.createVideoMetaData(pending);

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
    } catch (e) {
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
        } catch (error) {
          const updateErrMsg =
            error instanceof Error ? error.message : 'update_status_failed';

          this.logger.error('upload_videos.update_status.failed', {
            userId: user.id,
            videoId,
            errorMessage,
            updateErrorMessage: updateErrMsg,
            ...(error instanceof Error && error.stack
              ? { updateStack: error.stack }
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
      } catch (error) {
        const unlinkErrMsg =
          error instanceof Error ? error.message : 'unlink_failed';

        this.logger.warn('upload_videos.temp_file.delete_failed', {
          userId: user.id,
          videoId,
          tempFilePath: f.tempFilePath,
          unlinkErrorMessage: unlinkErrMsg,
          ...(error instanceof Error && error.stack
            ? { unlinkStack: error.stack }
            : {}),
        });
      }
    }
  }
}
