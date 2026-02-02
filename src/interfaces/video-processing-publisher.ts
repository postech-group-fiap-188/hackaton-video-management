export abstract class VideoProcessingPublisher {
  abstract publishProcessingEvent(input: { event: unknown }): Promise<void>;
}
