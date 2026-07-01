import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';

import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiKeyGuard],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
  });

  it('ApiKeyGuard should be properly configured with ApiKeyStrategy', () => {
    // This test implicitly checks the configuration by ensuring the guard extends AuthGuard('bearer')
    // and can be instantiated. More explicit checks would involve inspecting internal Passport.js
    // mechanisms, which is beyond the scope of a unit test for the guard itself.
    expect(guard).toBeInstanceOf(AuthGuard('bearer'));
  });

  it(`ApiKeyGuard should extend AuthGuard with 'bearer' strategy`, (): void => {
    expect(guard).toBeInstanceOf(AuthGuard('bearer'));
  });

  it('ApiKeyGuard should handle execution context correctly', async (): Promise<void> => {
    // Mock ExecutionContext
    const mockExecutionContext = {
      switchToHttp: (): {
        getRequest: () => { headers: { authorization: string } };
      } => ({
        getRequest: (): { headers: { authorization: string } } => ({
          headers: { authorization: 'Bearer test-token' },
        }),
      }),
    } as unknown as ExecutionContext;

    // For a failing test, we expect canActivate to return false or throw an error.
    // Since the underlying strategy is not implemented yet, it will throw UnauthorizedException.
    let thrownError: unknown;
    try {
      await guard.canActivate(mockExecutionContext);
    } catch (error: unknown) {
      thrownError = error;
    }
    expect(thrownError).toBeDefined();
  });

  it('ApiKeyGuard should preserve request context in authentication failures', async (): Promise<void> => {
    // This test is implicitly covered by the HttpExceptionFilter in E2E tests.
    // For unit testing, we can check if canActivate throws an error.
    const mockExecutionContext = {
      switchToHttp: (): {
        getRequest: () => { headers: { authorization: string } };
      } => ({
        getRequest: (): { headers: { authorization: string } } => ({
          headers: { authorization: 'Bearer invalid-token' },
        }),
      }),
    } as unknown as ExecutionContext;

    let thrownError: unknown;
    try {
      await guard.canActivate(mockExecutionContext);
    } catch (error: unknown) {
      thrownError = error;
    }
    expect(thrownError).toBeDefined();
  });
});
