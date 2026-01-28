import { ConfigService } from '@nestjs/config';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SnsVideoProcessingAdapter } from './sns-video-processing.adapter';

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn(),
  PublishCommand: jest.fn().mockImplementation((args) => ({ __type: 'PublishCommand', args })),
}));

describe('SnsVideoProcessingAdapter', () => {
  const makeConfig = (vals: Record<string, any>) =>
    ({ get: (k: string) => vals[k] } as unknown as ConfigService);

  beforeEach(() => {
    jest.clearAllMocks();
    (SNSClient as unknown as jest.Mock).mockImplementation(() => ({ send: jest.fn().mockResolvedValue(undefined) }));
  });

  it('constructor: falha sem SNS_PROCESSING_TOPIC_ARN', () => {
    expect(() => new SnsVideoProcessingAdapter(makeConfig({})))
      .toThrow('Missing SNS_PROCESSING_TOPIC_ARN');
  });

  it('publishProcessingEvent: usa eventType default e serializa mensagem', async () => {
    const adapter = new SnsVideoProcessingAdapter(
      makeConfig({ SNS_PROCESSING_TOPIC_ARN: 'arn:topic', AWS_REGION: 'us-east-1' }),
    );

    const clientInstance = (SNSClient as unknown as jest.Mock).mock.results[0].value;
    const sendSpy = jest.spyOn(clientInstance, 'send');

    const event = {
      videoId: 'v',
      userId: 'u',
      inputBucket: 'in-b',
      inputKey: 'in-k',
      outputBucket: 'out-b',
      outputZipKey: 'out.zip',
      contentType: 'video/mp4',
      size: 123,
    };

    await adapter.publishProcessingEvent({ event });

    expect(PublishCommand).toHaveBeenCalledWith({
      TopicArn: 'arn:topic',
      Message: JSON.stringify(event),
      MessageAttributes: {
        eventType: { DataType: 'String', StringValue: 'VideoUploaded' },
      },
    });
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ __type: 'PublishCommand' }));
  });

  it('publishProcessingEvent: usa eventType custom', async () => {
    const adapter = new SnsVideoProcessingAdapter(
      makeConfig({ SNS_PROCESSING_TOPIC_ARN: 'arn:topic' }),
    );

    await adapter.publishProcessingEvent({
      event: {
        videoId: 'v', userId: 'u', inputBucket: 'b', inputKey: 'k',
        outputBucket: 'ob', outputZipKey: 'z', contentType: 'x', size: 1,
      },
      eventType: 'VideoReprocessed',
    });

    expect(PublishCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: 'VideoReprocessed' },
        },
      }),
    );
  });
});
