import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppLoggerService {
  private readonly logger = new Logger('VideoUploadService');

  info(message: string, meta: Record<string, unknown> = {}): void {
    this.logger.log(JSON.stringify({ message, ...meta }));
  }
  warn(message: string, meta: Record<string, unknown> = {}): void {
    this.logger.warn(JSON.stringify({ message, ...meta }));
  }
  error(message: string, meta: Record<string, unknown> = {}): void {
    this.logger.error(JSON.stringify({ message, ...meta }));
  }
}
