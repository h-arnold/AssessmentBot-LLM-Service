import * as fs from 'node:fs/promises';
import http from 'node:http';
import * as path from 'node:path';

import { runCmd as runCommand, waitForHttp } from './utils/docker-utils';

jest.setTimeout(10 * 60 * 1000); // 10 minutes for build + run

const IMAGE_TAG = 'assessmentbot-backend:prod-test';
const CONTAINER_NAME = 'assessmentbot-backend-prod-test';
// __dirname = <repo>/test/prod-tests after relocation. Ascend two levels to reach repo root.
const REPO_ROOT = path.join(__dirname, '..', '..');
const DOCKERFILE = path.join(REPO_ROOT, 'Docker', 'Dockerfile.prod');

interface AssessorPayload {
  taskType: string;
  referenceTask: string;
  emptyTask: string;
  studentTask: string;
  [k: string]: unknown;
}

async function postJson(
  payload: Record<string, unknown>,
): Promise<{ status: number; json: unknown }> {
  const body = JSON.stringify({
    taskType: payload.taskType,
    reference: payload.referenceTask,
    template: payload.emptyTask,
    studentResponse: payload.studentTask,
  });
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
          'Content-Length': Buffer.byteLength(body).toString(),
        },
        hostname: 'localhost',
        port: 3002,
        path: '/v1/assessor',
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            resolve({ status: res.statusCode || 0, json: JSON.parse(raw) });
          } catch {
            reject(
              new Error(
                `Invalid JSON response (status ${res.statusCode}): ${raw}`,
              ),
            );
          }
        });
      },
    );
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

describe('Production Docker image smoke tests', () => {
  beforeAll(async () => {
    await runCommand(
      'docker',
      [
        'build',
        '-f',
        DOCKERFILE,
        '-t',
        IMAGE_TAG,
        '.',
        '--build-arg',
        'NODE_ENV=production',
      ],
      { cwd: REPO_ROOT },
    );
    await runCommand('docker', ['rm', '-f', CONTAINER_NAME]).catch(() => {});
    await runCommand('docker', [
      'run',
      '--name',
      CONTAINER_NAME,
      '-d',
      '-p',
      '3002:3000',
      '-e',
      'API_KEYS=test-api-key',
      '-e',
      'GEMINI_API_KEY=dummy-key',
      IMAGE_TAG,
    ]);
    await waitForHttp('http://localhost:3002/status', 60_000).catch(
      async () => {
        await waitForHttp('http://localhost:3002/', 30_000);
      },
    );
  });

  afterAll(async () => {
    await runCommand('docker', ['logs', CONTAINER_NAME])
      .then((r) => {
        console.info('--- Container logs start ---');
        console.info(r.stdout);
        console.info('--- Container logs end ---');
        return;
      })
      .catch(() => {});
    await runCommand('docker', ['rm', '-f', CONTAINER_NAME]).catch(() => {});
  });

  it('assessor TEXT & TABLE endpoints: no template/asset path errors', async () => {
    const dataDir = path.join(REPO_ROOT, 'test', 'data');
    const tableData = JSON.parse(
      await fs.readFile(path.join(dataDir, 'tableTask.json'), 'utf8'),
    );
    const textData = JSON.parse(
      await fs.readFile(path.join(dataDir, 'textTask.json'), 'utf8'),
    );

    const evaluate = async (
      _label: string,
      payload: AssessorPayload,
    ): Promise<void> => {
      const resp = await postJson(
        payload as unknown as Record<string, unknown>,
      );
      const logs = await runCommand('docker', ['logs', CONTAINER_NAME])
        .then((r) => r.stdout)
        .catch(() => '');
      const disallowedPatterns = [
        /ENOENT/gi,
        /Invalid markdown filename/gi,
        /Unauthorised file path/gi,
      ];
      const offending = disallowedPatterns.filter((p) => p.test(logs));
      const isCreated = resp.status === 201;
      const json: any = (resp as any).json; // eslint-disable-line @typescript-eslint/no-explicit-any
      const hasRequiredShape =
        json && ['completeness', 'accuracy', 'spag'].every((k) => k in json);
      expect(offending.length).toBe(0);
      expect(resp.status === 404).toBe(false);
      expect(!isCreated || hasRequiredShape).toBe(true);
    };

    await evaluate('text', textData);
    await evaluate('table', tableData);
  });
});
