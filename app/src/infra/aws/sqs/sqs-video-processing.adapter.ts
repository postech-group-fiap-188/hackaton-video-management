import { Injectable } from '@nestjs/common';
import { SqsService } from '@ssut/nestjs-sqs';

type VideoUploadedMessage = {
  type: 'VIDEO_UPLOADED';
  videoId: string;
  userId: string;
  inputBucket: string;
  inputKey: string;
  outputBucket: string;
  outputZipKey: string;
  contentType: string;
  size: number;
  createdAt: string;
};

@Injectable()
export class SqsVideoProcessingAdapter {
  constructor(private readonly sqs: SqsService) {}

  async enqueueProcessing(
    input: Omit<VideoUploadedMessage, 'type' | 'createdAt'>,
  ): Promise<void> {
    const body: VideoUploadedMessage = {
      type: 'VIDEO_UPLOADED',
      ...input,
      createdAt: new Date().toISOString(),
    };

    await this.sqs.send('videoProcessingProducer', {
      id: input.videoId,
      body,
    });
  }
}
