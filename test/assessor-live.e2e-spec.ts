import { promises as fs } from 'node:fs';
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

describe('AssessorController (e2e-live)', () => {
  let app: AppInstance;
  const logFilePath = path.join(
    __dirname,
    'logs',
    'assessor-live.e2e-spec.log',
  );

  let tableData: TaskData;
  let textData: TaskData;
  let referenceDataUri: string;
  let templateDataUri: string;
  let studentDataUri: string;

  beforeAll(async () => {
    app = await startApp(logFilePath);

    // Load test data asynchronously
    const dataDir = path.join(__dirname, 'data');
    const imageDir = path.join(__dirname, 'ImageTasks');

    const tableTaskPath = path.join(dataDir, 'tableTask.json');
    const textTaskPath = path.join(dataDir, 'textTask.json');

    tableData = JSON.parse(await fs.readFile(tableTaskPath, 'utf8'));
    textData = JSON.parse(await fs.readFile(textTaskPath, 'utf8'));

    referenceDataUri = await loadFileAsDataURI(
      path.join(imageDir, 'referenceTask.png'),
    );
    templateDataUri = await loadFileAsDataURI(
      path.join(imageDir, 'templateTask.png'),
    );
    studentDataUri = await loadFileAsDataURI(
      path.join(imageDir, 'studentTask.png'),
    );
  }, 20000); // Increased timeout for file loading

  afterAll(() => {
    stopApp(app.appProcess);
  });

  it('/v1/assessor (POST) should return a valid assessment for a text task', async () => {
    // Add delay before API call to avoid rate limiting
    await delay(2000);

    const mappedPayload = {
      taskType: 'TEXT',
      reference: textData.referenceTask,
      template: textData.emptyTask,
      studentResponse: textData.studentTask,
    };

    const response = await request(app.appUrl)
      .post('/v1/assessor')
      .set('Authorization', `Bearer ${app.apiKey}`)
      .send(mappedPayload)
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body).toHaveProperty('completeness');
    expect(response.body).toHaveProperty('accuracy');
    expect(response.body).toHaveProperty('spag');
  }, 30000);

  it('/v1/assessor (POST) should return a valid assessment for a table task', async () => {
    // Add delay before API call to avoid rate limiting
    await delay(2000);

    const mappedPayload = {
      taskType: 'TABLE',
      reference: tableData.referenceTask,
      template: tableData.emptyTask,
      studentResponse: tableData.studentTask,
    };

    const response = await request(app.appUrl)
      .post('/v1/assessor')
      .set('Authorization', `Bearer ${app.apiKey}`)
      .send(mappedPayload)
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body).toHaveProperty('completeness');
    expect(response.body).toHaveProperty('accuracy');
    expect(response.body).toHaveProperty('spag');
  }, 30000);

  it('/v1/assessor (POST) should return a valid assessment for an image task', async () => {
    // Add delay before API call to avoid rate limiting
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

    expect(response.body).toBeDefined();
    expect(response.body).toHaveProperty('completeness');
    expect(response.body).toHaveProperty('accuracy');
    expect(response.body).toHaveProperty('spag');
  }, 30000);
});
