import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';

import { ApiKeyThrottlerGuard } from './api-key-throttler.guard.js';

describe('ApiKeyThrottlerGuard', () => {
  let guard: ApiKeyThrottlerGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      providers: [ApiKeyThrottlerGuard],
    }).compile();

    guard = module.get<ApiKeyThrottlerGuard>(ApiKeyThrottlerGuard);
  });

  describe('getTracker', () => {
    it('should return the Bearer token for requests with a valid Authorization header', async () => {
      const request = {
        headers: { authorization: 'Bearer abc123' },
        ip: '127.0.0.1',
      };

      const tracker = await (
        guard as unknown as {
          getTracker: (request: Record<string, unknown>) => Promise<string>;
        }
      ).getTracker(request);

      expect(tracker).toBe('abc123');
    });

    it('should return the trimmed Bearer token when the token contains surrounding whitespace', async () => {
      const request = {
        headers: { authorization: 'Bearer   abc123   ' },
        ip: '127.0.0.1',
      };

      const tracker = await (
        guard as unknown as {
          getTracker: (request: Record<string, unknown>) => Promise<string>;
        }
      ).getTracker(request);

      expect(tracker).toBe('abc123');
    });

    it('should return the client IP when no Authorization header is present', async () => {
      const request = {
        headers: {},
        ip: '0.0.0.0',
        ips: [],
      };

      const tracker = await (
        guard as unknown as {
          getTracker: (request: Record<string, unknown>) => Promise<string>;
        }
      ).getTracker(request);

      expect(tracker).toBe('0.0.0.0');
    });

    it('should return the client IP when Authorization header does not use Bearer scheme', async () => {
      const request = {
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
        ip: '0.0.0.0',
      };

      const tracker = await (
        guard as unknown as {
          getTracker: (request: Record<string, unknown>) => Promise<string>;
        }
      ).getTracker(request);

      expect(tracker).toBe('0.0.0.0');
    });

    it('should return the client IP when Authorization header is an empty string', async () => {
      const request = {
        headers: { authorization: '' },
        ip: '0.0.0.0',
      };

      const tracker = await (
        guard as unknown as {
          getTracker: (request: Record<string, unknown>) => Promise<string>;
        }
      ).getTracker(request);

      expect(tracker).toBe('0.0.0.0');
    });

    it('should handle missing headers gracefully', async () => {
      const request = {
        ip: '0.0.0.0',
      };

      const tracker = await (
        guard as unknown as {
          getTracker: (request: Record<string, unknown>) => Promise<string>;
        }
      ).getTracker(request);

      expect(tracker).toBe('0.0.0.0');
    });

    it('should fall back to IP when the headers object is null', async () => {
      const request = {
        headers: null,
        ip: '0.0.0.0',
      };

      const tracker = await (
        guard as unknown as {
          getTracker: (request: Record<string, unknown>) => Promise<string>;
        }
      ).getTracker(request);

      expect(tracker).toBe('0.0.0.0');
    });

    it('should return an empty string when IP is also missing', async () => {
      const request = {};

      const tracker = await (
        guard as unknown as {
          getTracker: (request: Record<string, unknown>) => Promise<string>;
        }
      ).getTracker(request);

      expect(tracker).toBe('');
    });
  });
});
