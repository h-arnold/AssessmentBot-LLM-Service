import path from 'node:path';

import { getCurrentDirname } from 'src/common/file-utilities';
import request from 'supertest';

import {
  startApp,
  stopApp,
  AppInstance,
  delay,
} from './utils/app-lifecycle.js';
import { loadFileAsDataURI } from './utils/e2e-helpers.js';

interface TaskData {
  taskType: string;
  referenceTask: string;
  emptyTask: string;
  studentTask: string;
}

describe('AssessorController (e2e)', () => {
  let app: AppInstance;
  const logFilePath = path.join(
    getCurrentDirname(),
    'logs',
    'assessor.e2e-spec.log',
  );

  let textTask: TaskData = {
    taskType: 'TEXT',
    referenceTask: '',
    emptyTask: '',
    studentTask: '',
  };

  let referenceDataUri: string;
  let templateDataUri: string;
  let studentDataUri: string;

  beforeAll(async () => {
    app = await startApp(logFilePath, {
      DEFAULT_TEXT_TABLE_MODEL: 'gemini-flash-latest',
      DEFAULT_IMAGE_MODEL: 'gemini-flash-latest',
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
  });

  afterAll(() => {
    stopApp(app.appProcess);
  });

  describe('Auth and Validation', () => {
    it('/v1/assessor (POST) should return 401 Unauthorised when no API key is provided', async () => {
      const response = await request(app.appUrl)
        .post('/v1/assessor')
        .send(textTask)
        .expect(401);
      expect(response.body.message).toBe('Unauthorized');
    });

    it('/v1/assessor (POST) should return 401 Unauthorised when an invalid API key is provided', async () => {
      const response = await request(app.appUrl)
        .post('/v1/assessor')
        .set('Authorization', 'Bearer invalid-key')
        .send(textTask)
        .expect(401);
      expect(response.body.message).toBe('Invalid API key');
    });

    it('/v1/assessor (POST) should return 400 Bad Request for invalid DTO', async () => {
      const invalidPayload = { ...textTask, taskType: 'INVALID' };
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
  });

  it('/v1/assessor (POST) IMAGE should return 201 with the captured image assessment markers', async () => {
    // Add delay before API call to avoid rate limiting
    await delay(2000);

    // Uses the actual DTO field names (`reference`, `template`,
    // `studentResponse`), not the legacy `TaskData` fixture fields.
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

    expect(response.body).toHaveProperty('completeness');
    expect(response.body).toHaveProperty('accuracy');
    expect(response.body).toHaveProperty('spag');
    // Assert the captured image-response variant, whose scores and
    // reasoning are distinct from the text variant (completeness 3,
    // spag 2, fitness-tracker reasoning). The Gemini mock detects
    // native conversation `inlineData` parts carrying image MIME
    // types, so this image request selects the captured image
    // response instead of the text/table fallback.
    expect(response.body.completeness.score).toBe(5);
    expect(response.body.completeness.reasoning).toContain(
      'What actually happened',
    );
    expect(response.body.accuracy.score).toBe(5);
    expect(response.body.accuracy.reasoning).toContain('code screenshot');
    expect(response.body.spag.score).toBe(4);
    expect(response.body.spag.reasoning).toContain('minor SPaG error');
  });
});
