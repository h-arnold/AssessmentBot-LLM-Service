import path from 'node:path';

import { getCurrentDirname } from 'src/common/file-utilities';
import request from 'supertest';

import {
  AppInstance,
  delay,
  startApp,
  stopApp,
} from './utils/app-lifecycle.js';
import { loadFileAsDataURI } from './utils/e2e-helpers.js';

describe('MistralAssessor (e2e)', () => {
  let app: AppInstance;
  const logFilePath = path.join(
    getCurrentDirname(),
    'logs',
    'mistral.e2e-spec.log',
  );

  let referenceDataUri: string;
  let templateDataUri: string;
  let studentDataUri: string;

  beforeAll(async () => {
    app = await startApp(logFilePath, {
      DEFAULT_TEXT_TABLE_MODEL: 'mistral-small-latest',
      DEFAULT_IMAGE_MODEL: 'mistral-small-latest',
    });

    const imageDirectory = path.join(getCurrentDirname(), 'test', 'ImageTasks');
    referenceDataUri = await loadFileAsDataURI(
      path.join(imageDirectory, 'referenceTask.png'),
    );
    templateDataUri = await loadFileAsDataURI(
      path.join(imageDirectory, 'templateTask.png'),
    );
    studentDataUri = await loadFileAsDataURI(
      path.join(imageDirectory, 'studentTask.png'),
    );
  }, 20000);

  afterAll(() => {
    stopApp(app.appProcess);
  });

  it('/v1/assessor (POST) TEXT should return 201 Created for valid DTO and route to the Mistral provider', async () => {
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

  it('/v1/assessor (POST) TABLE should return 201 and route through the Mistral provider', async () => {
    await delay(2000);

    const tablePayload = {
      taskType: 'TABLE',
      reference: '| Col A | Col B |\n| Data 1 | Data 2 |',
      template: '| Col A | Col B |\n| |',
      studentResponse: '| Col A | Col B |\n| Foo | Bar |',
    };

    const response = await request(app.appUrl)
      .post('/v1/assessor')
      .set('Authorization', `Bearer ${app.apiKey}`)
      .send(tablePayload)
      .expect(201);

    expect(response.body).toHaveProperty('completeness');
    expect(response.body).toHaveProperty('accuracy');
    expect(response.body).toHaveProperty('spag');
    // TABLE tasks go through the text path in the mock, so they also
    // carry the "Mistral mocked" marker.
    expect(response.body.completeness.reasoning).toContain('Mistral mocked');
    expect(typeof response.body.accuracy.reasoning).toBe('string');
    expect(response.body.accuracy).toHaveProperty('score');
    expect(typeof response.body.spag.reasoning).toBe('string');
    expect(response.body.spag).toHaveProperty('score');
  });

  it('/v1/assessor (POST) IMAGE should return 201 and route through the Mistral provider', async () => {
    await delay(2000);

    const imagePayload = {
      taskType: 'IMAGE',
      reference: referenceDataUri,
      template: templateDataUri,
      studentResponse: studentDataUri,
    };

    const response = await request(app.appUrl)
      .post('/v1/assessor')
      .set('Authorization', `Bearer ${app.apiKey}`)
      .send(imagePayload)
      .expect(201);

    // The mock's `mistralImageResponse` is realistic captured data — it has
    // `completeness`, `accuracy`, and `spag` at the top level but does NOT
    // carry the `"Mistral mocked"` marker (the image variant uses fully
    // realistic reasoning text).
    expect(response.body).toHaveProperty('completeness');
    expect(response.body).toHaveProperty('accuracy');
    expect(response.body).toHaveProperty('spag');
    expect(typeof response.body.completeness.reasoning).toBe('string');
    expect(response.body.completeness).toHaveProperty('score');
    expect(typeof response.body.accuracy.reasoning).toBe('string');
    expect(response.body.accuracy).toHaveProperty('score');
    expect(typeof response.body.spag.reasoning).toBe('string');
    expect(response.body.spag).toHaveProperty('score');
  });
});
