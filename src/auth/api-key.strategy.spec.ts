import { UnauthorizedException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';

import { ApiKeyService } from './api-key.service';
import { ApiKeyStrategy } from './api-key.strategy';
import { User } from './user.interface';

const mockApiKeyService = {
  validate: jest.fn(),
};

/**
 * Unit tests for the ApiKeyStrategy.
 */
describe('ApiKeyStrategy', () => {
  let strategy: ApiKeyStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyStrategy,
        {
          provide: ApiKeyService,
          useValue: mockApiKeyService,
        },
      ],
    }).compile();

    strategy = module.get<ApiKeyStrategy>(ApiKeyStrategy);
    // Suppress logger warnings for tests that expect exceptions.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  /**
   * Test suite for the validate method.
   */
  describe('validate', () => {
    /**
     * Tests that a valid API key and correctly formed Bearer scheme result in a user object.
     */
    it('should return the user object when authentication is successful', async () => {
      const user: User = { apiKey: 'test-key' };
      const token = 'valid-api-key';
      const request = { headers: { authorization: 'Bearer ' + token } } as Request;

      mockApiKeyService.validate.mockResolvedValue(user);

      const result = await strategy.validate(request, token);

      expect(mockApiKeyService.validate).toHaveBeenCalledWith(token);
      expect(result).toEqual(user);
    });

    /**
     * Tests that an invalid API key results in an UnauthorizedException.
     */
    it('should throw an UnauthorizedException if authentication fails', async () => {
      const token = 'invalid-api-key';
      const request = { headers: { authorization: 'Bearer ' + token } } as Request;

      mockApiKeyService.validate.mockResolvedValue(null);

      await expect(strategy.validate(request, token)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockApiKeyService.validate).toHaveBeenCalledWith(token);
    });

    /**
     * Tests that a malformed Bearer scheme (e.g., lowercase) is rejected and a warning is logged.
     */
    it('should throw an UnauthorizedException and log a warning for a malformed Bearer scheme', async () => {
      const token = 'any-key';
      const request = { headers: { authorization: 'bearer ' + token } } as Request;

      await expect(strategy.validate(request, token)).rejects.toThrow(
        new UnauthorizedException('Malformed Bearer scheme.'),
      );

      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        'Malformed Bearer scheme detected: "bearer"',
      );
    });

    /**
     * Tests that a correctly formed Bearer scheme does not cause an exception.
     */
    it('should not throw for a valid Bearer scheme', async () => {
      const user: User = { apiKey: 'test-key' };
      const token = 'valid-api-key';
      const request = { headers: { authorization: 'Bearer ' + token } } as Request;

      mockApiKeyService.validate.mockResolvedValue(user);

      await expect(strategy.validate(request, token)).resolves.toEqual(user);
    });
  });
});
