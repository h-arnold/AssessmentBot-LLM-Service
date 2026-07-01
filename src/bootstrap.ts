import { NestFactory } from '@nestjs/core';
import { json, type Express } from 'express';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';

import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';

export interface BootstrapOptions {
  bufferLogs?: boolean;
  host?: string;
}

type ExpressAppWithSet = Pick<Express, 'set'>;

export async function bootstrap(options: BootstrapOptions = {}): Promise<void> {
  const { bufferLogs = true, host = '0.0.0.0' } = options;
  const app = await NestFactory.create(AppModule, {
    bufferLogs,
  });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  // Set Express query parser to 'extended' for compatibility with qs-style query strings
  const expressApp = app
    .getHttpAdapter()
    .getInstance() as ExpressAppWithSet;
  expressApp.set('query parser', 'extended');

  const configService = app.get(ConfigService);
  const payloadLimit = configService.getGlobalPayloadLimit();
  const port = configService.get('PORT');

  app.use(json({ limit: payloadLimit }));

  // Bind to all interfaces so remote port-forwarding (Codespaces, containers)
  // can reach the server. Some environments require an explicit host.
  await app.listen(port, host);
}
