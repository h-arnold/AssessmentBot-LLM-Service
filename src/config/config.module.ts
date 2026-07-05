import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { ConfigService } from './config.service';

/**
 * @module ConfigModule
 * @description
 * This module is responsible for providing the application's configuration services.
 * It imports the underlying `NestConfigModule` to handle the loading of `.env` files but only exports
 * our custom, validation-aware `ConfigService`.
 * @remarks
 * **Architectural Reasoning:**
 * This module acts as a boundary, ensuring that the rest of the application interacts only with our
 * custom `ConfigService`. This enforces a consistent pattern for configuration access and prevents
 * direct, unvalidated use of `process.env` or the standard `NestConfigModule` elsewhere in the codebase.
 * This centralisation is key to maintainable and testable configuration management.
 *
 * **Usage:**
 * Other modules should import this `ConfigModule` to gain access to the `ConfigService` via dependency injection.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      envFilePath: '.env',
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
