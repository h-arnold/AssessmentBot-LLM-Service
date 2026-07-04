import { IncomingMessage, ServerResponse } from 'node:http';

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule, Params } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module';
import { LogRedactor } from './common/utils/log-redactor.utility';
import { ConfigModule } from './config/config.module';
import { ConfigService } from './config/config.service';
import { throttlerConfig } from './config/throttler.config';
import { StatusModule } from './status/status.module';
import { AssessorModule } from './v1/assessor/assessor.module';

// Type guard to check if req has an id property of type string or number
function hasRequestId(
  request: IncomingMessage,
): request is IncomingMessage & { id: string | number } {
  const maybeRequest = request as unknown as { id?: unknown };
  return (
    Object.prototype.hasOwnProperty.call(maybeRequest, 'id') &&
    (typeof maybeRequest.id === 'string' || typeof maybeRequest.id === 'number')
  );
}

/**
 * @module AppModule
 *
 * @description
 * The root module of the application, responsible for orchestrating and wiring together all other modules.
 *
 * @remarks
 * **Module Initialization Order:**
 * The order of module imports is significant. `ConfigModule` is imported first to ensure that environment
 * variables are loaded and validated before any other module attempts to use them.
 *
 * **Logging:**
 * `LoggerModule` is configured asynchronously to use the `ConfigService` for setting the log level,
 * ensuring that logging behaviour is consistent with the application's configuration.
 *
 * **Global Throttling (Rate-Limiting):**
 * This module establishes the application's global rate-limiting strategy.
 * 1.  `ThrottlerModule.forRoot(throttlerConfig)`: This imports the throttler configuration from `throttler.config.ts`,
 *     setting up the default rate limits that apply to all unauthenticated routes across the application.
 * 2.  `{ provide: APP_GUARD, useClass: ThrottlerGuard }`: This registers the `ThrottlerGuard` as a global guard.
 *     By doing so, every endpoint in the application is automatically protected by the default rate-limiting
 *     rules unless explicitly overridden in a specific controller.
 *
 * This setup provides a baseline level of protection against abuse, which can then be fine-tuned for specific
 * resource-intensive or authenticated endpoints.
 *
 * @see config/throttler.config.ts - For the source of the default throttler configuration.
 * @see v1/assessor/assessor.controller.ts - For an example of how to override the global throttler settings.
 */
const customProperties = (
  request: IncomingMessage,
  _response: ServerResponse<IncomingMessage>,
): { reqId: string | number | undefined } => ({
  reqId: hasRequestId(request) ? request.id : undefined,
});

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Params => {
        const logLevel = configService.get('LOG_LEVEL');
        const nodeEnvironment = configService.get('NODE_ENV');
        const logFile = process.env.LOG_FILE; // Used for E2E tests

        const serializers = {
          req: (request: IncomingMessage): IncomingMessage =>
            LogRedactor.redactRequest(request),
        };

        // For E2E tests: write JSON logs to a specified file.
        if (logFile) {
          return {
            pinoHttp: {
              level: logLevel,
              transport: {
                target: 'pino/file',
                options: { destination: logFile },
              },
              serializers,
              customProps: customProperties,
            },
          };
        }

        // For production: use the default Pino JSON logger.
        if (nodeEnvironment === 'production') {
          return {
            pinoHttp: {
              level: logLevel,
              serializers,
              customProps: customProperties,
            },
          };
        }

        // For development: use pino-pretty for more readable console output.
        return {
          pinoHttp: {
            level: logLevel,
            transport: {
              target: 'pino-pretty',
              options: { singleLine: true },
            },
            serializers,
            customProps: customProperties,
          },
        };
      },
    }),
    AuthModule,
    AssessorModule,
    StatusModule,
    ThrottlerModule.forRoot(throttlerConfig),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
