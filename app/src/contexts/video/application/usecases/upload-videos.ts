import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import pLimit, { LimitFunction } from 'p-limit';
import { VideoGateway } from '../gateways/video-gateway';

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
      perRequestParallel: number;
      globalLimiter: LimitFunction;
    },
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
    const now = new Date();
    const perReqLimiter = pLimit(Math.max(1, this.cfg.perRequestParallel));

    const tasks: Array<Promise<UploadResultItem>> = input.files.map((f) =>
      perReqLimiter(() =>
        this.cfg.globalLimiter(async (): Promise<UploadResultItem> => {
          let videoId: string | undefined;

          try {
            input.validate({
              originalFileName: f.originalFileName,
              contentType: f.contentType,
              size: f.size,
            });

            videoId = randomUUID();
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
              createdAt: now,
              updatedAt: now,
            });

            await this.gateway.uploadMultipartFromPath({
              bucket: this.cfg.inputBucket,
              key: inputKey,
              filePath: f.tempFilePath,
              contentType: f.contentType,
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

            return {
              ok: true,
              videoId,
              inputKey,
              outputZipKey,
              status: 'PENDING',
            } as const;
          } catch (e: unknown) {
            const errorMessage =
              e instanceof Error ? e.message : 'upload_failed';

            if (videoId) {
              await this.gateway
                .updateStatus({ videoId, status: 'ERROR', errorMessage })
                .catch(() => undefined);
            }

            return {
              ok: false,
              originalFileName: f.originalFileName,
              status: 'ERROR',
              errorMessage,
              videoId,
            } as const;
          } finally {
            await fs.unlink(f.tempFilePath).catch(() => undefined);
          }
        }),
      ),
    );

    const items = await Promise.all(tasks);
    return { items };
  }
}
