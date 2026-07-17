import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // 大题包 confirm 时 JSON 可能上百 MB(480 题面 + base64 内联测试点)
  app.use(json({ limit: '500mb' }));
  app.use(urlencoded({ extended: true, limit: '500mb' }));

  // 结构化日志 (Pino) — JSON 输出便于聚合
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  // Swagger / OpenAPI 文档
  const config = new DocumentBuilder()
    .setTitle('OJ Platform API')
    .setDescription('在线评判平台 REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, doc, { swaggerOptions: { persistAuthorization: true } });

  const port = Number(process.env.API_PORT) || 3001;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
