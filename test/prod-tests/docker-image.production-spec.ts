import * as fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { Logger } from '@nestjs/common';
import { generateApiKey } from 'src/common/utils/crypto.utilities';

import { runCommand, waitForHttp } from './utils/docker-utilities.js';

// Mint a single valid abt_-prefixed key for the container environment.
// Generated once at module load so it is stable for the suite.
const PROD_TEST_API_KEY = generateApiKey('abt_');

const logger = new Logger('DockerImageProdSpec');

const IMAGE_TAG = 'assessmentbot-backend:prod-test';
const CONTAINER_NAME = 'assessmentbot-backend-prod-test';
const REPO_ROOT = process.cwd();
const DOCKERFILE = path.join(REPO_ROOT, 'Docker', 'Dockerfile.prod');

interface AssessorPayload {
  taskType: string;
  referenceTask: string;
  emptyTask: string;
  studentTask: string;
  [k: string]: unknown;
}

/**
 * Send a POST request with a JSON body to the assessor endpoint.
 * @param {Record<string, unknown>} payload - The request payload.
 * @returns {Promise<{ status: number; json: unknown }>} The HTTP status code
 *   and parsed JSON response.
 */
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
          Authorization: `Bearer ${PROD_TEST_API_KEY}`,
          'Content-Length': Buffer.byteLength(body).toString(),
        },
        hostname: 'localhost',
        port: 3002,
        path: '/v1/assessor',
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => {
          chunks.push(c);
        });
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsedJson: unknown;
          try {
            parsedJson = JSON.parse(raw);
          } catch {
            reject(
              new Error(
                `Invalid JSON response (status ${response.statusCode}): ${raw}`,
              ),
            );
            return;
          }
          resolve({
            status: response.statusCode || 0,
            json: parsedJson,
          });
        });
      },
    );
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

/**
 * Evaluate an assessor payload against the running Docker container.
 * @param {string} _label - A label for the test case (unused).
 * @param {AssessorPayload} payload - The assessor payload to send.
 */
async function evaluate(
  _label: string,
  payload: AssessorPayload,
): Promise<void> {
  const resp = await postJson(payload as unknown as Record<string, unknown>);
  let logs = '';
  try {
    const r = await runCommand('docker', ['logs', CONTAINER_NAME]);
    logs = r.stdout;
  } catch {
    logs = '';
  }
  const disallowedPatterns = [
    /ENOENT/gi,
    /Invalid markdown filename/gi,
    /Unauthorised file path/gi,
  ];
  const offending = disallowedPatterns.filter((p) => p.test(logs));
  const isCreated = resp.status === 201;
  const json = resp.json;
  const hasRequiredShape =
    json &&
    ['completeness', 'accuracy', 'spag'].every((k) => Object.hasOwn(json, k));
  expect(offending).toHaveLength(0);
  expect(resp.status).not.toBe(404);
  expect(!isCreated || hasRequiredShape).toBe(true);
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
    try {
      await runCommand('docker', ['rm', '-f', CONTAINER_NAME]);
    } catch {
      // ignore
    }
    await runCommand('docker', [
      'run',
      '--name',
      CONTAINER_NAME,
      '-d',
      '-p',
      '3002:3000',
      '-e',
      `API_KEYS=${PROD_TEST_API_KEY}`,
      '-e',
      'GEMINI_API_KEY=dummy-key',
      IMAGE_TAG,
    ]);
    try {
      await waitForHttp('http://localhost:3002/status', 60_000);
    } catch {
      await waitForHttp('http://localhost:3002/', 30_000);
    }
  });

  afterAll(async () => {
    try {
      const r = await runCommand('docker', ['logs', CONTAINER_NAME]);
      logger.log('--- Container logs start ---');
      logger.log(r.stdout);
      logger.log('--- Container logs end ---');
    } catch {
      // ignore
    }
    try {
      await runCommand('docker', ['rm', '-f', CONTAINER_NAME]);
    } catch {
      // ignore
    }
  });

  it('assessor TEXT & TABLE endpoints: no template/asset path errors', async () => {
    expect.hasAssertions();
    const dataDirectory = path.join(REPO_ROOT, 'test', 'data');
    const tableData = JSON.parse(
      await fs.readFile(path.join(dataDirectory, 'tableTask.json'), 'utf8'),
    );
    const textData = JSON.parse(
      await fs.readFile(path.join(dataDirectory, 'textTask.json'), 'utf8'),
    );

    await evaluate('text', textData);
    await evaluate('table', tableData);
  });
});
