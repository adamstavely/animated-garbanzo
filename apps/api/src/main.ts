import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<AppConfig, true>);

  const port = config.get('port', { infer: true });
  const apiPrefix = config.get('apiPrefix', { infer: true });
  const webOrigin = config.get('webOrigin', { infer: true });
  const isProduction = config.get('isProduction', { infer: true });
  const trustProxy = config.get('trustProxy', { infer: true });

  // Only when a reverse proxy sits in front. OIDC still uses OIDC_REDIRECT_URI
  // for the code exchange and never trusts Host / X-Forwarded-* for that path.
  if (trustProxy > 0) {
    app.set('trust proxy', trustProxy);
  }

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix(apiPrefix);

  // Credentials are required because the session travels in an httpOnly cookie.
  app.enableCors({ origin: webOrigin, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();

  if (!isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Nym API')
        .setDescription('Pen name generation, screening and approval')
        .setVersion('1.0')
        .build(),
    );
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  await app.listen(port);
  new Logger('Bootstrap').log(`Nym API listening on :${port}/${apiPrefix}`);
}

void bootstrap();
