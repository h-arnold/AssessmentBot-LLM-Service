import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * A guard that extends the `AuthGuard` with the 'bearer' strategy.
 * This guard is used to authenticate requests based on API keys
 * provided in the Authorization header using the Bearer token format.
 * @example
 * ```typescript
 * // Usage in a controller
 * \@UseGuards(ApiKeyGuard)
 * \@Get('protected-route')
 * async getProtectedData() {
 *   return 'This route is protected by the ApiKeyGuard';
 * }
 * ```
 * @see AuthGuard
 */
@Injectable()
export class ApiKeyGuard extends AuthGuard('bearer') {}
