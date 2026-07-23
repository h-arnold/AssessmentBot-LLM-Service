import path from 'node:path';

import { getCurrentDirname } from 'src/common/file-utilities';
import request from 'supertest';

import {
  AppInstance,
  delay,
  startApp,
  stopApp,
} from './utils/app-lifecycle.js';

describe('MistralAssessor (e2e)', () => {
  let app: AppInstance;
  const logFilePath = path.join(
    getCurrentDirname(),
    'logs',
    'mistral.e2e-spec.log',
  );

  beforeAll(async () => {
    app = await startApp(logFilePath, {
      DEFAULT_TEXT_TABLE_MODEL: 'mistral-small-latest',
      DEFAULT_IMAGE_MODEL: 'mistral-small-latest',
    });
  });

  afterAll(() => {
    stopApp(app.appProcess);
  });

  describe('Auth and Validation', () => {
    it('/v1/assessor (POST) should return 401 Unauthorised when no API key is provided', async () => {
      const response = await request(app.appUrl)
        .post('/v1/assessor')
        .send({
          taskType: 'TEXT',
          reference: 'test',
          template: 'test',
          studentResponse: 'test',
        })
        .expect(401);
      expect(response.body.message).toBe('Unauthorized');
    });

    it('/v1/assessor (POST) should return 401 Unauthorised when an invalid API key is provided', async () => {
      const response = await request(app.appUrl)
        .post('/v1/assessor')
        .set('Authorization', 'Bearer invalid-key')
        .send({
          taskType: 'TEXT',
          reference: 'test',
          template: 'test',
          studentResponse: 'test',
        })
        .expect(401);
      expect(response.body.message).toBe('Invalid API key');
    });

    it('/v1/assessor (POST) should return 400 Bad Request for invalid DTO', async () => {
      const invalidPayload = {
        taskType: 'INVALID',
        reference: 'test',
        template: 'test',
        studentResponse: 'test',
      };
      const response = await request(app.appUrl)
        .post('/v1/assessor')
        .set('Authorization', `Bearer ${app.apiKey}`)
        .send(invalidPayload)
        .expect(400);
      expect(response.body.message).toBe('Validation failed');
    });
  });

  it('/v1/assessor (POST) should return 201 Created for valid DTO', async () => {
    // Add delay before API call to avoid rate limiting
    await delay(2000);

    const validPayload = {
      taskType: 'TEXT',
      reference: 'test',
      template: 'test',
      studentResponse: 'test',
    };

    const response = await request(app.appUrl)
      .post('/v1/assessor')
      .set('Authorization', `Bearer ${app.apiKey}`)
      .send(validPayload)
      .expect(201);
    expect(response.body).toHaveProperty('completeness');
    expect(response.body).toHaveProperty('accuracy');
    expect(response.body).toHaveProperty('spag');
    // Assert that the Mistral mock path was exercised. The captured
    // `mistralTextResponse` keeps the `"Mistral mocked"` marker in its
    // completeness reasoning so we can prove the Mistral provider (not the
    // Gemini fallback) served the response; accuracy and spag carry realistic
    // reasoning text instead.
    expect(response.body.completeness.reasoning).toContain('Mistral mocked');
    expect(typeof response.body.accuracy.reasoning).toBe('string');
    expect(response.body.accuracy).toHaveProperty('score');
    expect(typeof response.body.spag.reasoning).toBe('string');
    expect(response.body.spag).toHaveProperty('score');
  });
});
