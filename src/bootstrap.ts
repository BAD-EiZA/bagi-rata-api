import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { parseOrigins } from './config/env.validation';

let cachedExpress: Express | undefined;
let cachedNest: INestApplication | undefined;

export async function getExpressApp(): Promise<Express> {
  if (cachedExpress) {
    return cachedExpress;
  }

  const expressApp = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    { rawBody: true },
  );

  configureApp(app);
  await app.init();

  cachedNest = app;
  cachedExpress = expressApp;
  return expressApp;
}

export async function listenLocal(port?: number) {
  const expressApp = await getExpressApp();
  const config = cachedNest!.get(ConfigService);
  const listenPort = port ?? config.get<number>('PORT') ?? 3001;
  await new Promise<void>((resolve) => {
    expressApp.listen(listenPort, () => resolve());
  });
  // eslint-disable-next-line no-console
  console.log(`bagi-rata-api listening on http://localhost:${listenPort}`);
  // eslint-disable-next-line no-console
  console.log(`OpenAPI docs: http://localhost:${listenPort}/docs`);
}

function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const origins = parseOrigins(config.get<string>('FRONTEND_ORIGINS'));
  const port = config.get<number>('PORT') ?? 3001;

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
    .addServer(
      process.env.APP_URL ?? `http://localhost:${port}`,
      process.env.APP_ENV ?? 'local',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
  });
}
