# Guards

This module provides route protection and authentication mechanisms through custom NestJS guards. Guards ensure that only authorised requests can access protected endpoints.

## ApiKeyThrottlerGuard

**Location:** `src/auth/api-key-throttler.guard.ts`

A custom rate-limiting guard that extends `ThrottlerGuard` to key rate-limiting by API key for authenticated requests, falling back to IP-based tracking for unauthenticated traffic.

### Features

- **API-key-based tracking**: Requests bearing a valid `Authorization: Bearer <token>` header are tracked using the token value itself, ensuring each API key has its own independent rate-limit counter.
- **IP fallback**: Unauthenticated requests are tracked by client IP address (default `ThrottlerGuard` behaviour).
- **Global registration**: Registered as a global `APP_GUARD` in `AppModule`, applying to all routes by default.

### How It Works

The guard overrides the `getTracker` method: when an `Authorization: Bearer` header is present, the Bearer token value is returned as the tracker string; otherwise, the client's IP address is used.

### Usage

The guard is registered globally in `AppModule` and does not need to be applied manually. Endpoint-specific overrides can be applied using `@Throttle()`:

```typescript
@Throttle(authenticatedThrottler)
@Controller('v1/assessor')
export class AssessorController {}
```

### Dependencies

- **NestJS Common**: For `@Injectable` decorator
- **@nestjs/throttler**: For the `ThrottlerGuard` base class

## ApiKeyGuard

The `ApiKeyGuard` is a simple authentication guard that extends NestJS's `AuthGuard` with the 'bearer' strategy. It protects routes by validating API keys provided in the Authorization header using the Bearer token format.

### Features

- **Bearer Token Authentication**: Validates API keys in `Authorization: Bearer <token>` format
- **Passport Integration**: Built on Passport.js with the bearer strategy
- **Route Protection**: Can be applied to individual routes, controllers, or globally
- **Seamless Integration**: Works with NestJS's built-in authentication system

### Usage

#### Protecting Individual Routes

```typescript
import { ApiKeyGuard } from '@/auth/api-key.guard';
import { UseGuards } from '@nestjs/common';

@Controller('api/v1')
export class ProtectedController {
  @UseGuards(ApiKeyGuard)
  @Get('protected-route')
  async getProtectedData() {
    return 'This route is protected by the ApiKeyGuard';
  }
}
```

#### Protecting Entire Controllers

```typescript
@UseGuards(ApiKeyGuard)
@Controller('api/v1/admin')
export class AdminController {
  // All routes in this controller are protected

  @Get('users')
  async getUsers() {
    return this.userService.findAll();
  }

  @Post('users')
  async createUser(@Body() userData: CreateUserDto) {
    return this.userService.create(userData);
  }
}
```

#### Global Protection

```typescript
// In app module or main.ts
import { APP_GUARD } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
```

### Authentication Flow

1. **Request Interception**: Guard intercepts incoming requests to protected routes
2. **Header Extraction**: Extracts the Authorization header from the request
3. **Token Validation**: Passes the bearer token to the underlying Passport strategy
4. **Strategy Processing**: The bearer strategy validates the API key
5. **Access Decision**: Grants or denies access based on validation result

### Expected Header Format

```http
Authorization: Bearer your-api-key-here
```

### Integration with Passport Strategy

The guard works in conjunction with the bearer strategy implementation:

```typescript
// This is handled by the underlying strategy
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'bearer') {
  validate(token: string): boolean | User {
    // Strategy validates the token and returns user context
    return this.authService.validateApiKey(token);
  }
}
```

### Error Handling

When authentication fails, the guard automatically returns:

- **HTTP 401 Unauthorized**: For missing or invalid API keys
- **Consistent Error Format**: Works with the application's exception filters

### Security Considerations

- **Token Transmission**: API keys should be transmitted over HTTPS in production
- **Key Management**: Implement proper API key rotation and revocation
- **Rate Limiting**: Consider implementing rate limiting for API key usage
- **Logging**: Monitor API key usage for security auditing

### Implementation

The guard is implemented as a simple extension of the base AuthGuard:

```typescript
@Injectable()
export class ApiKeyGuard extends AuthGuard('bearer') {}
```

This delegates all authentication logic to the configured bearer strategy, ensuring:

- **Separation of Concerns**: Guard handles routing protection, strategy handles validation
- **Flexibility**: Strategy can be modified without changing guard implementation
- **Consistency**: Uses standard Passport.js patterns

### Dependencies

- **NestJS Common**: For Injectable decorator and guard interfaces
- **Passport**: For AuthGuard base class and authentication strategies

### Testing

The guard can be tested by mocking the underlying strategy:

```typescript
describe('ApiKeyGuard', () => {
  it('should extend AuthGuard with bearer strategy', () => {
    const guard = new ApiKeyGuard();
    expect(guard).toBeInstanceOf(AuthGuard('bearer'));
  });
});
```

### Related Components

- **ApiKeyStrategy**: Implements the actual validation logic
- **ApiKeyService**: Manages API key storage and validation
- **HttpExceptionFilter**: Handles authentication failure responses
- **ApiKeyThrottlerGuard**: Custom rate-limiting guard for API-key-based throttling

## Best Practices

- **Selective Application**: Only apply guards to routes that actually need protection
- **Strategy Configuration**: Ensure the bearer strategy is properly configured
- **Environment Security**: Use environment variables for API key configuration
- **Documentation**: Clearly document which routes require authentication
- **Testing**: Include authentication tests in your endpoint testing
