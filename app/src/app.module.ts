import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ApiModule } from 'src/infra/api/api.module';
import { CorrelationIdMiddleware } from 'src/infra/api/common/middleware/correlation-id.middleware';
import { AwsHandlersModule } from './infra/aws/handlers/aws-handlers.module';
import { ConfigModule } from '@nestjs/config/dist/config.module';

@Module({
  imports: [
    ApiModule,
    AwsHandlersModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
