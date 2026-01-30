import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { UserContextProps } from 'src/video/domain/entities/user-context';

export type ProcessingEvent = {
  videoId: string;
  user: UserContextProps;
  inputBucket: string;
  inputKey: string;
  outputBucket: string;
  outputZipKey: string;
  contentType: string;
  size: number;
  event: string;
  originalFileName: string;
};

@Injectable()
export class SnsVideoProcessingAdapter {
  private readonly client: SNSClient;
  private readonly topicArn: string;

  constructor(config: ConfigService) {
    const region = config.get<string>('AWS_REGION') ?? 'us-east-1';
    const endpoint = config.get<string>('AWS_ENDPOINT_URL') ?? undefined;

    const topicArn = config.get<string>('SNS_PROCESSING_TOPIC_ARN');
    if (!topicArn) throw new Error('Missing SNS_PROCESSING_TOPIC_ARN');
    this.topicArn = topicArn;

    this.client = new SNSClient({
      region,
      endpoint,
    });
  }

  async publishProcessingEvent(input: {
    event: ProcessingEvent;
    eventType?: string;
  }): Promise<void> {
    const eventType = input.eventType ?? 'VideoUploaded';

    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Message: JSON.stringify(input.event),
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: eventType },
        },
      }),
    );
  }
}
