import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      trustProxy: true,
    }),
  );
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());
  
  // Global interceptors
  app.useGlobalInterceptors(
    // new LoggingInterceptor(),
    new TransformInterceptor(),
  );

    // CORS configuration - Fastify syntax
  await app.register(require('@fastify/cors'), {
    origin: true,
    credentials: true,
  });
  
  await app.register(require('@fastify/multipart'));

  // Global prefix
  app.setGlobalPrefix('api');
  
  // Listen on all interfaces (0.0.0.0) for Docker/cloud deployments
  await app.listen(port, '0.0.0.0');
  

  // pm2 graceful shutdown
  process.on('SIGINT', async () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      console.log('🛑 Received shutdown message from PM2...');
      app.close().then(() => {
        process.exit(0);
      });
    }
  });
}
bootstrap();
