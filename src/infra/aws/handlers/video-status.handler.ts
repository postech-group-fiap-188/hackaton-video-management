import { Injectable } from '@nestjs/common';
import type { Message } from '@aws-sdk/client-sqs';
import { SqsConsumerEventHandler, SqsMessageHandler } from '@ssut/nestjs-sqs';
import { z } from 'zod';

import { UpdateVideoStatus } from 'src/video/application/usecases/update-video-status';
import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';
import { VideoStatus } from 'src/video/domain/enums/video-status';

type StatusMessage = {
  videoId: string;
  status: VideoStatus;
  errorMessage?: string;
};

const StatusSchema = z.object({
  videoId: z.string().min(1),
  status: z.nativeEnum(VideoStatus).refine((s) => s !== VideoStatus.PENDING, {
    message: 'invalid status',
  }),
  errorMessage: z.string().optional(),
});

@Injectable()
export class VideoStatusHandler {
  constructor(
    private readonly updateStatus: UpdateVideoStatus,
    private readonly logger: AppLoggerService,
  ) {}

  @SqsMessageHandler('videoStatusConsumer', false)
  async handleMessage(message: Message): Promise<void> {
    const messageId = message.MessageId ?? 'unknown';
    const raw = message.Body ?? '';

    if (!raw) {
      this.logger.warn('sqs_status_empty_body', { messageId });
      return;
    }

    let payload: StatusMessage;

    try {
      const json = safeJsonParse(raw);
      payload = parseStatus(json);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.logger.error('sqs_status_invalid_payload', {
        messageId,
        error: errorMessage,
        raw,
      });
      throw err;
    }

    await this.updateStatus.execute({
      videoId: payload.videoId,
      status: payload.status,
      errorMessage: payload.errorMessage,
    });

    this.logger.info('sqs_status_processed', {
      messageId,
      videoId: payload.videoId,
      status: payload.status,
    });
  }

  @SqsConsumerEventHandler('videoStatusConsumer', 'processing_error')
  onProcessingError(error: Error, message: Message): void {
    this.logger.error('sqs_processing_error', {
      messageId: message.MessageId ?? 'unknown',
      error: error.message,
    });
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Invalid JSON in VIDEO_STATUS payload');
  }
}

function parseStatus(value: unknown): StatusMessage {
  const parsed = StatusSchema.safeParse(value);

  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));

    throw new Error(`Invalid VIDEO_STATUS payload: ${JSON.stringify(details)}`);
  }

  return parsed.data;
}
