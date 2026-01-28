import { Injectable } from '@nestjs/common';
import type { Message } from '@aws-sdk/client-sqs';
import { SqsConsumerEventHandler, SqsMessageHandler } from '@ssut/nestjs-sqs';
import { z } from 'zod';
import { UpdateVideoStatus } from 'src/contexts/video/application/usecases/update-video-status';
import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';

const StatusSchema = z.object({
  videoId: z.string().min(1),
  status: z.enum(['SUCCEEDED', 'ERROR']),
  errorMessage: z.string().optional(),
});
type StatusMessage = z.infer<typeof StatusSchema>;

@Injectable()
export class VideoStatusHandler {
  constructor(
    private readonly updateStatus: UpdateVideoStatus,
    private readonly logger: AppLoggerService,
  ) {}

  @SqsMessageHandler('videoStatusConsumer', false)
  async handle(message: Message): Promise<void> {
    const messageId = message.MessageId ?? 'unknown';
    const raw = message.Body;
    if (!raw) throw new Error('Empty SQS message body');

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
