/**
 * @file Barrel file for the configuration module.
 * @remarks
 * This file re-exports the essential public-facing components of the configuration module,
 * making them easier to import into other parts of the application.
 * This simplifies import statements and decouples other modules from the internal file structure of the config module.
 *
 * It exports:
 * - `ConfigModule`: The primary module to be imported by other feature modules.
 * - `ConfigService`: The injectable service for accessing runtime configuration.
 * - `Config`: The TypeScript type representing the fully validated application configuration.
 */

export { ConfigModule } from './config.module';
export { ConfigService } from './config.service';
export type { Config } from './environment.schema';
