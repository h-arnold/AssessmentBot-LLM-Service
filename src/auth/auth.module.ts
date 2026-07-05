import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { ApiKeyStrategy } from './api-key.strategy';
import { ConfigModule } from '../config/config.module';

/**
 * The `AuthModule` is responsible for managing authentication-related functionality
 * within the application. It integrates various services, strategies, and guards
 * to handle API key-based authentication.
 * @module AuthModule
 *
 * **imports:**
 * - `PassportModule`: Provides authentication middleware and strategies.
 * - `ConfigModule`: Handles application configuration and environment variables.
 *
 * **providers:**
 * - `ApiKeyStrategy`: Defines the strategy for API key authentication.
 * - `ApiKeyGuard`: Protects routes by enforcing API key authentication.
 * - `ApiKeyService`: Provides services related to API key management.
 * - `Logger`: Logs authentication-related activities.
 *
 * **exports:**
 * - `ApiKeyStrategy`: Makes the API key strategy available for use in other modules.
 * - `ApiKeyGuard`: Allows other modules to enforce API key authentication.
 * - `ApiKeyService`: Enables other modules to utilise API key management services.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'bearer' }),
    ConfigModule,
  ],
  providers: [ApiKeyStrategy, ApiKeyGuard, ApiKeyService],
  exports: [ApiKeyStrategy, ApiKeyGuard, ApiKeyService],
})
export class AuthModule {}
