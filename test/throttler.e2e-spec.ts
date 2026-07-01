import path from 'node:path';

import { getCurrentDirname } from 'src/common/file-utils';
import request from 'supertest';

import { startApp, stopApp, AppInstance, delay } from './utils/app-lifecycle';

describe('Throttler (e2e)', () => {
  let app: AppInstance;
  const logFilePath = path.join(getCurrentDirname(), 'logs', 'throttler.e2e-spec.log');

  beforeAll(async () => {
    // As we are not testing the throttler service itself, but rather the implementation of the throttler,
    // we can use a longer ttl to accommodate API rate limiting delays and custom limits to ensure config is picked up from process.env.
    const environmentOverrides = {
      THROTTLER_TTL: '20000', // Increased to 20 seconds to accommodate delays for API rate limiting
      UNAUTHENTICATED_THROTTLER_LIMIT: '5',
      AUTHENTICATED_THROTTLER_LIMIT: '10',
    };

    app = await startApp(logFilePath, environmentOverrides);
  });

  afterAll(() => {
    stopApp(app.appProcess);
  });

  describe('Unauthenticated Routes', () => {
    it('should enforce rate limiting for unauthenticated users', async () => {
      // 1. Allow requests up to the limit
      const successfulRequests = Array.from(
        { length: app.unauthenticatedThrottlerLimit },
        () => request(app.appUrl).get('/health').expect(200),
      );
      await Promise.all(successfulRequests);

      // 2. Reject requests exceeding the limit and check header
      const throttledResponse = await request(app.appUrl).get('/health');
      expect(throttledResponse.status).toBe(429);
      expect(throttledResponse.headers['retry-after']).toBeDefined();
      expect(
        Number(throttledResponse.headers['retry-after']),
      ).toBeGreaterThan(0);

      // 3. Reset the limit after the TTL expires
      await new Promise((resolve) => setTimeout(resolve, app.throttlerTtl));
      const afterResetResponse = await request(app.appUrl).get('/health');
      expect(afterResetResponse.status).toBe(200);
    }, 30000); // Increased timeout to accommodate longer TTL (20s + overhead)
  });

  describe('Authenticated Routes', () => {
    it('should enforce rate limiting for authenticated users', async () => {
      const postData = {
        taskType: 'TEXT',
        reference: 'The quick brown fox jumps over the lazy dog.',
        template: 'Write a sentence about a fox.',
        studentResponse: 'A fox is a mammal.',
      };

      // 1. Allow requests up to the limit - make them sequential with delays
      // to avoid API rate limiting while staying within the throttle window (20s)
      // Balance between avoiding API rate limits and staying within throttle window
      for (let index = 0; index < app.authenticatedThrottlerLimit; index++) {
        await delay(600); // 600ms delay between requests (6s + response times ~= 10-12s total, well within 20s window)
        await request(app.appUrl)
          .post('/v1/assessor')
          .set('Authorization', `Bearer ${app.apiKey}`)
          .send(postData)
          .expect(201);
      }

      // 2. Reject requests exceeding the limit (should happen immediately without delay)
      const throttledResponse = await request(app.appUrl)
        .post('/v1/assessor')
        .set('Authorization', `Bearer ${app.apiKey}`)
        .send(postData);
      expect(throttledResponse.status).toBe(429);

      // 3. Reset the limit after the TTL expires
      await new Promise((resolve) => setTimeout(resolve, app.throttlerTtl));

      await delay(1500); // Longer delay after reset before final request
      const afterResetResponse = await request(app.appUrl)
        .post('/v1/assessor')
        .set('Authorization', `Bearer ${app.apiKey}`)
        .send(postData);
      expect(afterResetResponse.status).toBe(201);
    }, 120000); // Increased timeout to 2 minutes to accommodate longer TTL and sequential requests
  });

  it.todo('should log throttled requests (requires log capture setup)');
});
