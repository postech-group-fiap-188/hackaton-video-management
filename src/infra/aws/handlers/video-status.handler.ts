import { Injectable } from '@nestjs/common';
import type { Message } from '@aws-sdk/client-sqs';
import { SqsConsumerEventHandler, SqsMessageHandler } from '@ssut/nestjs-sqs';
import { z } from 'zod';
import { UpdateVideoStatus } from 'src/video/application/usecases/update-video-status';
import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';
import { VideoStatus } from 'src/video/domain/enums/video-status';

const StatusSchema = z.object({
  videoId: z.string().min(1),
  status: z
    .nativeEnum(VideoStatus)
    .refine((s) => s !== VideoStatus.PENDING, { message: 'invalid status' }),
  errorMessage: z.string().optional(),
});

    const json = safeJsonParse(raw);
    const payload = parseStatus(json);

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
  return JSON.parse(raw) as unknown;
}
function parseStatus(value: unknown): StatusMessage {
  const parsed = StatusSchema.safeParse(value);
  console.log('Parsed SQS VIDEO_STATUS message:', parsed);
  if (!parsed.success) throw new Error('Invalid VIDEO_STATUS payload');
  return parsed.data;
}