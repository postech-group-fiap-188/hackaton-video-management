import { Injectable } from '@nestjs/common';
import type { Message } from '@aws-sdk/client-sqs';
import { SqsConsumerEventHandler, SqsMessageHandler } from '@ssut/nestjs-sqs';
import { z } from 'zod';

import { UpdateVideoStatus } from 'src/application/usecases/update-video-status';
import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';
import { VideoStatus } from 'src/domain/enums/video-status';

type StatusMessage = {
  videoId: string;
  status: VideoStatus;
  errorMessage?: string;
};

const UserSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  name: z.string().min(1),
});

const BasePayloadSchema = z.object({
  videoId: z.string().min(1),
  user: UserSchema,
  event: z.string().min(1),
  timestamp: z.iso.datetime(),
  outputZipKey: z.string().optional(),
  error: z.string().optional(),
});

const ProcessedExtrasSchema = z.object({
  outputZipKey: z.string().min(1),
});

const ErrorExtrasSchema = z.object({
  error: z.string().min(1),
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

    let mapped: StatusMessage;

    try {
      const json = safeJsonParse(raw);
      mapped = mapQueuePayloadToStatus(json);
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
      videoId: mapped.videoId,
      status: mapped.status,
      errorMessage: mapped.errorMessage,
    });

    this.logger.info('sqs_status_processed', {
      messageId,
      videoId: mapped.videoId,
      status: mapped.status,
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

function mapQueuePayloadToStatus(value: unknown): StatusMessage {
  const parsed = BasePayloadSchema.safeParse(value);

  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    throw new Error(`Invalid VIDEO_STATUS payload: ${JSON.stringify(details)}`);
  }

  const payload = parsed.data;

  switch (payload.event) {
    case 'VIDEO_PROCESSED': {
      const extras = ProcessedExtrasSchema.safeParse({
        outputZipKey: payload.outputZipKey,
      });

      if (!extras.success) {
        throw new Error(
          `Invalid VIDEO_STATUS payload: ${JSON.stringify(
            extras.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          )}`,
        );
      }

      return {
        videoId: payload.videoId,
        status: VideoStatus.SUCCEEDED,
      };
    }

    case 'VIDEO_ERROR': {
      const extras = ErrorExtrasSchema.safeParse({
        error: payload.error,
      });

      if (!extras.success) {
        throw new Error(
          `Invalid VIDEO_STATUS payload: ${JSON.stringify(
            extras.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          )}`,
        );
      }

      return {
        videoId: payload.videoId,
        status: VideoStatus.ERROR,
        errorMessage: extras.data.error,
      };
    }

    default:
      throw new Error(`Unsupported VIDEO_STATUS event: ${payload.event}`);
  }
}
