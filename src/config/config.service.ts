import * as fs from 'node:fs';
import path from 'node:path';

import { Injectable } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { z } from 'zod';

import { configSchema, type Config } from './environment.schema.js';

/**
 * @class ConfigService
 * @description
 * This service is the single source of truth for all **runtime** environment configuration in the application.
 * It is responsible for loading environment variables from `.env` files and `process.env`, validating them against
 * the centralized `configSchema`, and making them available to the rest of the application through a clean, injectable service.
 * @remarks
 * **Architectural Reasoning:**
 * - **Centralisation:** All configuration access is channelled through this service, preventing configuration sprawl
 *   and ensuring consistency. Consumers inject this service rather than accessing `process.env` directly.
 * - **Validation at Startup:** By using the shared `configSchema`, the service validates the entire application
 *   configuration when it is instantiated. This catches misconfigurations early and causes the application to fail fast,
 *   which is a critical practice for robust systems.
 * - **Decoupling:** It abstracts the source of the configuration (e.g., `.env` vs. `process.env`) from the consumer.
 * - **Testability:** Centralising configuration makes it significantly easier to mock for unit and integration tests.
 *
 * **Usage:**
 * This service should be injected into any module that requires access to configuration values at runtime.
 * For configuration needed at **compile time** (e.g., in decorators), see `throttler.config.ts`.
 * @see environment.schema.ts - For the source of truth on validation rules.
 * @see throttler.config.ts - For an example of compile-time configuration.
 */
@Injectable()
export class ConfigService {
  private readonly config: Config;

  constructor() {
    let loadedEnvironment = {};

    // Determine which env file to load based on NODE_ENV
    const environmentFileName =
      process.env.NODE_ENV === 'test' ? '.test.env' : '.env';
    const environmentFilePath = path.resolve(
      process.cwd(),
      environmentFileName,
    );

    // envFilePath is constructed from cwd and a fixed filename, safe to use
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (fs.existsSync(environmentFilePath)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      loadedEnvironment = dotenv.parse(fs.readFileSync(environmentFilePath));
    }

    // Merge loaded .env variables with process.env, prioritizing process.env
    const combinedEnvironment = { ...loadedEnvironment, ...process.env };

    // Validate environment variables against the schema
    try {
      this.config = configSchema.parse(combinedEnvironment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid environment configuration: ${error.message}`); // Or a custom/NestJS exception
      }
      throw error;
    }
  }

  /**
   * Retrieves a configuration value by its key.
   * @param {T} key The key of the configuration value to retrieve.
   * @returns {Config[T]} The typed configuration value.
   */
  get<T extends keyof Config>(key: T): Config[T] {
    // `key` is constrained to validated schema keys, so this access is not user-controlled.
    // eslint-disable-next-line security/detect-object-injection
    return this.config[key];
  }

  /**
   * Calculates the global payload limit for the application based on the max
   * image upload size. This is used to configure the `body-parser` middleware.
   * @returns {string} A string representing the payload limit (e.g., '9mb').
   */
  getGlobalPayloadLimit(): string {
    const maxImageSizeMB = this.config.MAX_IMAGE_UPLOAD_SIZE_MB;
    // Formula: ((MAX_IMAGE_UPLOAD_SIZE_MB * 1.33 * 3) + 1) MB
    const limitInMB = Math.ceil(maxImageSizeMB * 1.33 * 3 + 1);
    return `${limitInMB}mb`;
  }
}
