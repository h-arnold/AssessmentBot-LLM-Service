import { Module } from '@nestjs/common';

import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { ConfigModule } from '../config/config.module';

/**
 * Module providing status and health check functionality for the application.
 *
 * This module encapsulates all status-related features including health checks,
 * connectivity tests, error testing, and authentication validation. It provides
 * essential monitoring and diagnostic capabilities for the application.
 * @module StatusModule
 *
 * **imports:**
 * - `ConfigModule`: Required for configuration access
 *
 * **controllers:**
 * - `StatusController`: Handles status and health check HTTP endpoints
 *
 * **providers:**
 * - `StatusService`: Business logic for status and health operations
 *
 * **exports:**
 * - `StatusService`: Makes the service available to other modules
 */
@Module({
  imports: [ConfigModule],
  controllers: [StatusController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
