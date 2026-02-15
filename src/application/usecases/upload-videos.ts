import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

import type { VideoGateway } from '../gateways/video-gateway';
import { User, type UserProps } from 'src/domain/entities/user';
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

type ProcessOneContext = {
  user: User;
  file: {
    originalFileName: string;
    contentType: string;
    size: number;
    tempFilePath: string;
  };
  now: Date;
  videoId: string;
  inputKey: string;
  outputZipKey: string;
  createdPending: boolean;
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
    const ctx = this.buildProcessContext(input);

    this.logger.info('upload_videos.process_one.start', {
      userId: ctx.user.id,
      videoId: ctx.videoId,
      originalFileName: ctx.file.originalFileName,
      contentType: ctx.file.contentType,
      size: ctx.file.size,
    });

    try {
      this.validateFile(ctx, input.validate);

      await this.createPending(ctx);
      await this.uploadSource(ctx);
      await this.publishPendingEvent(ctx);

      this.logger.info('upload_videos.process_one.success', {
        userId: ctx.user.id,
        videoId: ctx.videoId,
        inputKey: ctx.inputKey,
        outputZipKey: ctx.outputZipKey,
      });

      return this.makeOkResult(ctx);
    } catch (err) {
      return await this.handleProcessFailure(ctx, err);
    } finally {
      await this.deleteTempFileSafe(ctx);
    }
  }

  private buildProcessContext(input: {
    user: User;
    file: {
      originalFileName: string;
      contentType: string;
      size: number;
      tempFilePath: string;
    };
    now: Date;
  }): ProcessOneContext {
    const videoId = randomUUID();

    const ext = path.extname(input.file.originalFileName).toLowerCase();
    const inputKey = `${input.user.id}-${videoId}-source${ext}`;
    const outputZipKey = `${input.user.id}-${videoId}-processed.zip`;

    return {
      user: input.user,
      file: input.file,
      now: input.now,
      videoId,
      inputKey,
      outputZipKey,
      createdPending: false,
    };
  }

  private validateFile(
    ctx: ProcessOneContext,
    validate: (meta: {
      originalFileName: string;
      contentType: string;
      size: number;
    }) => void,
  ): void {
    validate({
      originalFileName: ctx.file.originalFileName,
      contentType: ctx.file.contentType,
      size: ctx.file.size,
    });

    this.logger.info('upload_videos.validate.ok', {
      userId: ctx.user.id,
      videoId: ctx.videoId,
      originalFileName: ctx.file.originalFileName,
    });
  }

  private async createPending(ctx: ProcessOneContext): Promise<void> {
    const pending = new Video(
      ctx.user,
      this.cfg.inputBucket,
      ctx.inputKey,
      ctx.file.originalFileName,
      ctx.file.contentType,
      ctx.file.size,
      VideoStatus.PENDING,
      undefined,
      ctx.now,
      ctx.now,
      ctx.videoId,
    );

    await this.gateway.createVideoMetaData(pending);
    ctx.createdPending = true;

    this.logger.info('upload_videos.create_pending.ok', {
      userId: ctx.user.id,
      videoId: ctx.videoId,
      inputBucket: this.cfg.inputBucket,
      inputKey: ctx.inputKey,
    });
  }

  private async uploadSource(ctx: ProcessOneContext): Promise<void> {
    await this.gateway.uploadMultipartFromPath({
      bucket: this.cfg.inputBucket,
      key: ctx.inputKey,
      filePath: ctx.file.tempFilePath,
      contentType: ctx.file.contentType,
    });

    this.logger.info('upload_videos.upload_multipart.ok', {
      userId: ctx.user.id,
      videoId: ctx.videoId,
      bucket: this.cfg.inputBucket,
      key: ctx.inputKey,
    });
  }

  private async publishPendingEvent(ctx: ProcessOneContext): Promise<void> {
    await this.gateway.publishProcessingEvent({
      videoId: ctx.videoId,
      user: ctx.user.toProps(),
      inputBucket: this.cfg.inputBucket,
      inputKey: ctx.inputKey,
      outputBucket: this.cfg.outputBucket,
      outputZipKey: ctx.outputZipKey,
      contentType: ctx.file.contentType,
      size: ctx.file.size,
      originalFileName: ctx.file.originalFileName,
      event: 'VIDEO_PENDING',
    });

    this.logger.info('upload_videos.publish_processing_event.ok', {
      userId: ctx.user.id,
      videoId: ctx.videoId,
      outputBucket: this.cfg.outputBucket,
      outputZipKey: ctx.outputZipKey,
    });
  }

  private makeOkResult(ctx: ProcessOneContext): UploadResultItem {
    return {
      ok: true,
      videoId: ctx.videoId,
      inputKey: ctx.inputKey,
      outputZipKey: ctx.outputZipKey,
      status: VideoStatus.PENDING,
    } as const;
  }

  private async handleProcessFailure(
    ctx: ProcessOneContext,
    err: unknown,
  ): Promise<UploadResultItem> {
    const errorMessage = err instanceof Error ? err.message : 'upload_failed';

    this.logger.error('upload_videos.process_one.failed', {
      userId: ctx.user.id,
      videoId: ctx.videoId,
      originalFileName: ctx.file.originalFileName,
      errorMessage,
      ...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
      createdPending: ctx.createdPending,
    });

    if (ctx.createdPending) {
      await this.setErrorStatusSafe(ctx, errorMessage);
    } else {
      this.logger.warn('upload_videos.update_status.skipped', {
        userId: ctx.user.id,
        videoId: ctx.videoId,
        reason: 'pending_not_created',
        errorMessage,
      });
    }

    return {
      ok: false,
      originalFileName: ctx.file.originalFileName,
      status: VideoStatus.ERROR,
      errorMessage,
      videoId: ctx.videoId,
    } as const;
  }

  private async setErrorStatusSafe(
    ctx: ProcessOneContext,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.gateway.updateStatus({
        videoId: ctx.videoId,
        status: VideoStatus.ERROR,
        errorMessage,
      });

      this.logger.warn('upload_videos.update_status.set_error', {
        userId: ctx.user.id,
        videoId: ctx.videoId,
        errorMessage,
      });
    } catch (error) {
      const updateErrMsg =
        error instanceof Error ? error.message : 'update_status_failed';

      this.logger.error('upload_videos.update_status.failed', {
        userId: ctx.user.id,
        videoId: ctx.videoId,
        errorMessage,
        updateErrorMessage: updateErrMsg,
        ...(error instanceof Error && error.stack
          ? { updateStack: error.stack }
          : {}),
      });
    }
  }

  private async deleteTempFileSafe(ctx: ProcessOneContext): Promise<void> {
    try {
      await unlink(ctx.file.tempFilePath);
      this.logger.info('upload_videos.temp_file.deleted', {
        userId: ctx.user.id,
        videoId: ctx.videoId,
        tempFilePath: ctx.file.tempFilePath,
      });
    } catch (error) {
      const unlinkErrMsg =
        error instanceof Error ? error.message : 'unlink_failed';

      this.logger.warn('upload_videos.temp_file.delete_failed', {
        userId: ctx.user.id,
        videoId: ctx.videoId,
        tempFilePath: ctx.file.tempFilePath,
        unlinkErrorMessage: unlinkErrMsg,
        ...(error instanceof Error && error.stack
          ? { unlinkStack: error.stack }
          : {}),
      });
    }
  }
}
