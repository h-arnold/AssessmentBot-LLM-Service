import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-http-bearer';

import { ApiKeyService } from './api-key.service.js';
import { User } from './user.interface.js';

/**
 * Implements the passport-http-bearer strategy for API key authentication.
 * @remarks
 * This strategy validates API keys sent in the `Authorization` header using the Bearer scheme.
 * It ensures that the scheme is correctly formatted (i.e., `Bearer <token>`) and that the
 * provided API key is valid by delegating to the `ApiKeyService`.
 *
 * It includes a security enhancement to reject requests with a malformed Bearer scheme,
 * such as using a lowercase `bearer` or omitting the space after the scheme.
 * When a malformed scheme is detected, it logs a warning for administrative review
 * while returning a generic `401 Unauthorized` response to the client.
 * @see {@link https://www.passportjs.org/packages/passport-http-bearer/}
 */
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'bearer') {
  private readonly logger = new Logger(ApiKeyStrategy.name);

  /**
   * Constructs the ApiKeyStrategy.
   * @param {ApiKeyService} apiKeyService - The service responsible for
   *   validating API keys.
   */
  constructor(private readonly apiKeyService: ApiKeyService) {
    super({ passReqToCallback: true });
  }

  /**
   * Validates the API key from the request.
   * @param {Request} request - The incoming Express request object.
   * @param {string} apiKey - The API key extracted from the `Authorization`
   *   header.
   * @returns {Promise<User>} The user object associated with the validated API
   *   key.
   * @throws {UnauthorizedException} If the Bearer scheme is malformed, the API
   *   key is invalid, or no user is found.
   */
  async validate(request: Request, apiKey: string): Promise<User> {
    const authHeader = request.headers.authorization;

    if (authHeader && !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `Malformed Bearer scheme detected: "${authHeader.split(' ', 1)[0]}"`,
      );
      throw new UnauthorizedException('Malformed Bearer scheme.');
    }

    const user = await this.apiKeyService.validate(apiKey);
    if (!user) {
      this.logger.warn(
        'ApiKeyStrategy.validate: user is null, throwing UnauthorizedException',
      );
      throw new UnauthorizedException();
    }
    return user;
  }
}
