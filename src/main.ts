import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { parseOrigins } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3001;
  const origins = parseOrigins(config.get<string>('FRONTEND_ORIGINS'));

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(requestIdMiddleware);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidUnknownValues: true,
    }),
  );

  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Request-Id'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Bagi Rata API')
    .setDescription('REST API untuk platform pembagian pengeluaran bersama')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addServer(`http://localhost:${port}`, 'Local')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
  });

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`bagi-rata-api listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`OpenAPI docs: http://localhost:${port}/docs`);
}

void bootstrap();
