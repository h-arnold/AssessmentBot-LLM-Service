import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import request from 'supertest';

import { startApp, stopApp, AppInstance, delay } from './utils/app-lifecycle';

// Helper function to load a file and convert it to a data URI
const loadFileAsDataURI = async (filePath: string): Promise<string> => {
  const fileBuffer = await fs.readFile(filePath);
  const mimeType =
    path.extname(filePath) === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
};

interface TaskData {
  taskType: string;
  referenceTask: string;
  emptyTask: string;
  studentTask: string;
}

describe('AssessorController (e2e)', () => {
  let app: AppInstance;
  const logFilePath = path.join(__dirname, 'logs', 'assessor.e2e-spec.log');

  let textTask: TaskData = {
    taskType: 'TEXT',
    referenceTask: '',
    emptyTask: '',
    studentTask: '',
  };
  let tableTask: TaskData;
  let imageTask: TaskData;

  beforeAll(async () => {
    app = await startApp(logFilePath);
  });

  afterAll(() => {
    stopApp(app.appProcess);
  });

  describe('Auth and Validation', () => {
    it('/v1/assessor (POST) should return 401 Unauthorized when no API key is provided', async () => {
      const res = await request(app.appUrl)
        .post('/v1/assessor')
        .send(textTask)
        .expect(401);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('/v1/assessor (POST) should return 401 Unauthorized when an invalid API key is provided', async () => {
      const res = await request(app.appUrl)
        .post('/v1/assessor')
        .set('Authorization', 'Bearer invalid-key')
        .send(textTask)
        .expect(401);
      expect(res.body.message).toBe('Invalid API key');
    });

    it('/v1/assessor (POST) should return 400 Bad Request for invalid DTO', async () => {
      const invalidPayload = { ...textTask, taskType: 'INVALID' };
      const res = await request(app.appUrl)
        .post('/v1/assessor')
        .set('Authorization', `Bearer ${app.apiKey}`)
        .send(invalidPayload)
        .expect(400);
      expect(res.body.message).toBe('Validation failed');
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

    const res = await request(app.appUrl)
      .post('/v1/assessor')
      .set('Authorization', `Bearer ${app.apiKey}`)
      .send(validPayload)
      .expect(201);
    expect(res.body).toHaveProperty('completeness');
    expect(res.body).toHaveProperty('accuracy');
    expect(res.body).toHaveProperty('spag');
  });
});
