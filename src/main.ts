import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppLoggerService } from 'src/infra/api/common/logger/app-logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'https://fiap-lab.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'x-user-id',
      'x-user-email',
      'x-user-name',
    ],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Video Upload Service')
    .setDescription(
      'Aplicação para gerenciamento de vídeos, permitindo upload e envio para processamento, listagem e download dos vídeos processados.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        name: 'JWT',
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Informe o JWT',
      },
      'JWT',
    )
    .build();

  const doc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('swagger', app, doc);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');

  const logger = app.get(AppLoggerService);
  logger.info('app_started', {
    port,
    swagger: `http://localhost:${port}/swagger`,
  });
}

void bootstrap();
