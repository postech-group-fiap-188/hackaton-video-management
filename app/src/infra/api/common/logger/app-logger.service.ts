import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppLoggerService {
  private readonly logger = new Logger('VideoUploadService');

  private toJson(message: string, meta?: Record<string, unknown>) {
    return JSON.stringify(Object.assign({ message }, meta));
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.log(this.toJson(message, meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(this.toJson(message, meta));
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(this.toJson(message, meta));
  }
}
