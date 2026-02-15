import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AppLoggerService } from '../logger/app-logger.service';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const start = Date.now();

    this.logger.info('http_start', {
      correlationId: req.correlationId,
      method: req.method,
      url: req.originalUrl,
    });

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.info('http_end', {
            correlationId: req.correlationId,
            ms: Date.now() - start,
          }),
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'unknown_error';
          this.logger.error('http_error', {
            correlationId: req.correlationId,
            ms: Date.now() - start,
            error: message,
          });
        },
      }),
    );
  }
}
