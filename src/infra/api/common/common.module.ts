import { Global, Module } from '@nestjs/common';
import { AppLoggerService } from './logger/app-logger.service';

@Global()
@Module({
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class CommonModule {}
