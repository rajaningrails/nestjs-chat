import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import fastifyStatic from '@fastify/static';
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      trustProxy: true,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 4001);

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(new TransformInterceptor());

  await app.register(require('@fastify/cors'), {
    origin: true,
    credentials: true,
  });

  await app.register(require('@fastify/multipart'));

  // Global prefix
  // app.setGlobalPrefix('api');

  app.enableShutdownHooks();
  await app.register(fastifyStatic, {
    root: join(process.cwd(), 'public'),
    prefix: '/static/',
    decorateReply: true,
  });
  await app.listen(port, '0.0.0.0');

  const gracefulShutdown = async (signal: string) => {
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      gracefulShutdown('PM2 shutdown message');
    }
  });
}

bootstrap();
