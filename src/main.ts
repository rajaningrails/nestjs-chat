import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);

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

  // Handle PM2 graceful reload
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
