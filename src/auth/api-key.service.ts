import {
  Injectable,
  UnauthorizedException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { z } from 'zod';

import { User } from './user.interface.js';
import { ConfigService } from '../config/config.service.js';

/**
 * Service responsible for validating API keys used for authentication.
 *
 * This service loads valid API keys from configuration and provides validation
 * functionality to determine if an incoming API key is valid. It implements
 * comprehensive validation including format checking and authorisation.
 */
@Injectable()
export class ApiKeyService {
  private readonly apiKeys: string[];

  /**
   * Constructs the ApiKeyService and loads valid API keys from configuration.
   * @param {ConfigService} configService - Service providing access to
   *   application configuration.
   * @param {Logger} logger - Optional logger instance for recording
   *   authentication events.
   */
  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(Logger)
    private readonly logger: Logger = new Logger(ApiKeyService.name),
  ) {
    const apiKeysFromConfig = this.configService.get('API_KEYS');
    this.apiKeys = Array.isArray(apiKeysFromConfig) ? apiKeysFromConfig : [];
    this.logger.debug(`Loaded API keys: ${JSON.stringify(this.apiKeys)}`);
    if (this.apiKeys.length === 0) {
      this.logger.warn(
        'No API keys configured. All requests will be unauthorised.',
      );
    }
  }

  /**
   * Validates an API key against the configured valid keys.
   *
   * This method performs comprehensive validation including:
   * - Format validation (minimum length, character set)
   * - Authorisation check against configured valid keys.
   * @param {unknown} apiKey - The API key to validate (can be of any type
   *   initially).
   * @returns {User | null} A User object if the key is valid.
   * @throws {UnauthorizedException} If the API key is invalid or malformed.
   */
  validate(apiKey: unknown): User | null {
    this.logger.debug(`Attempting to validate an API key.`);
    const apiKeySchema = z
      .string()
      .min(10)
      .regex(/^[a-zA-Z0-9_-]+$/);
    const parsed = apiKeySchema.safeParse(apiKey);
    if (!parsed.success) {
      this.logger.warn('API key is missing or invalid.');
      throw new UnauthorizedException('Invalid API key');
    }
    const validKey = parsed.data;
    const isValid = this.apiKeys.includes(validKey);
    if (isValid) {
      this.logger.log('API key authentication attempt successful');
      return { apiKey: validKey };
    }
    this.logger.warn(`Invalid API key: ${JSON.stringify(validKey)}`);
    throw new UnauthorizedException('Invalid API key');
  }
}
