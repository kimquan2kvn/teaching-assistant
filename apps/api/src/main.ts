import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS);
  configureApp(app);
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
