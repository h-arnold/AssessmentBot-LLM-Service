import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * A custom throttler guard that keys rate-limiting by API key for
 * authenticated requests, falling back to IP-based tracking for
 * unauthenticated requests.
 * @remarks
 * Extends the default `ThrottlerGuard` and overrides `getTracker` so that
 * requests bearing a valid `Authorization: Bearer <token>` header are
 * tracked using the Bearer token value itself. This ensures each API key
 * has its own independent rate-limit counter, preventing one key from
 * being throttled by activity on another key behind the same IP.
 *
 * Requests without a Bearer token are tracked by the client IP (the
 * default behaviour).
 * @see ThrottlerGuard
 */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  /**
   * Determines the tracker string used for rate-limiting.
   *
   * When the request has an `Authorization` header starting with `Bearer `,
   * the trimmed Bearer token (the API key) is returned. Otherwise the
   * client IP address is used.
   * @param request - The Express/NestJS request object.
   * @returns A promise resolving to the tracker string.
   */
  protected async getTracker(
    request: Record<string, unknown>,
  ): Promise<string> {
    const headers = request.headers;

    if (
      headers !== null &&
      headers !== undefined &&
      typeof headers === 'object'
    ) {
      const authHeader = (headers as Record<string, unknown>).authorization;

      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
      }
    }

    return typeof request.ip === 'string' ? request.ip : '';
  }
}
