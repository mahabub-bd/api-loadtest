import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { AppModule } from './app.module';
import { ErrorShapeFilter } from './error-shape.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // bodyParser: false → register json() ourselves with a 1MB limit, which
    // the default 100KB parser would reject for large request bodies.
    bodyParser: false,
  });
  app.use(json({ limit: '1mb' }));
  app.enableCors();
  app.useGlobalFilters(new ErrorShapeFilter());

  // Only accept connections from the local machine unless explicitly exposed —
  // this server fires arbitrary requests on request and must not become a
  // LAN-accessible DoS launcher.
  const port = Number(process.env.PORT) || 4000;
  const host = process.env.HOST || 'localhost';
  await app.listen(port, host);
  console.log(`Benchmark server listening on http://${host}:${port}`);
}

void bootstrap();
