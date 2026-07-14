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
import { DEFAULT_API_KEY_PREFIX } from '../config/environment.schema.js';

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
  private readonly apiKeyPrefix: string;
  private readonly bodySchema: ReturnType<typeof z.base64url>;
  private readonly apiKeySet: Set<string>;

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
    this.apiKeyPrefix =
      this.configService.get('API_KEY_PREFIX') ?? DEFAULT_API_KEY_PREFIX;
    this.bodySchema = z.base64url().length(32);
    this.apiKeySet = new Set(this.apiKeys);
    this.logger.debug(`Loaded ${this.apiKeys.length} API key(s)`);
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
   * - Format validation (prefix check, body length and character set)
   * - Authorisation check against configured valid keys.
   * @remarks
   * (a) Opaque WARN prevents secret leakage at production `info` level.
   * (b) No branch logs the key value, even at DEBUG level.
   * (c) Both format branches use the same opaque message to avoid a format oracle.
   * @param {unknown} apiKey - The API key to validate (can be of any type
   *   initially).
   * @returns {User | null} A User object if the key is valid.
   * @throws {UnauthorizedException} If the API key is invalid or malformed.
   */
  validate(apiKey: unknown): User | null {
    // Step 1: Non-string/empty/prefix guard
    if (
      typeof apiKey !== 'string' ||
      apiKey.length === 0 ||
      !apiKey.startsWith(this.apiKeyPrefix)
    ) {
      this.logger.warn('API key is missing or has an invalid format.');
      throw new UnauthorizedException('Invalid API key');
    }

    // Step 2: Validate body format with z.base64url().length(32)
    const body = apiKey.slice(this.apiKeyPrefix.length);
    if (!this.bodySchema.safeParse(body).success) {
      this.logger.warn('API key is missing or has an invalid format.');
      throw new UnauthorizedException('Invalid API key');
    }

    // Step 3: Set membership check
    if (this.apiKeySet.has(apiKey)) {
      this.logger.log('API key authentication attempt successful');
      return { apiKey };
    }

    // Step 4: Correct format but not configured
    this.logger.warn('Authentication failed: invalid API key presented');
    this.logger.debug('Authentication failed: invalid API key presented');
    throw new UnauthorizedException('Invalid API key');
  }
}
