import path from 'node:path';

import { getCurrentDirname } from 'src/common/file-utils';
import request from 'supertest';

import { startApp, stopApp, AppInstance } from './utils/app-lifecycle';

describe('Main App (E2E)', () => {
  let app: AppInstance;
  const logFilePath = path.join(getCurrentDirname(), 'logs', 'main.e2e-spec.log');

  beforeAll(async () => {
    app = await startApp(logFilePath);
  });

  afterAll(() => {
    stopApp(app.appProcess);
  });

  it('should return a greeting from the root endpoint', async () => {
    const response = await request(app.appUrl)
      .get('/')
      .set('Authorization', `Bearer ${app.apiKey}`);
    expect(response.status).toBe(200);
    expect(response.text).toBe('Hello World!');
  });
});
