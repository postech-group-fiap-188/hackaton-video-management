import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLoggerService } from '../logger/app-logger.service';
import { AppError } from 'src/contexts/video/application/errors/app-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    if (exception instanceof AppError) {
      this.logger.warn('app_error', {
        correlationId: req.correlationId,
        code: exception.code,
        message: exception.message,
      });
      res.status(exception.statusCode).json({
        correlationId: req.correlationId,
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json({
        correlationId: req.correlationId,
        code: 'HTTP_ERROR',
        message: 'Request failed',
      });
      return;
    }

    const msg =
      exception instanceof Error ? exception.message : 'Internal error';
    this.logger.error('unhandled_exception', {
      correlationId: req.correlationId,
      message: msg,
    });

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      correlationId: req.correlationId,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}
