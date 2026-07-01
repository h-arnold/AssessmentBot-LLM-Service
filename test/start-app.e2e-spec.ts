import * as fs from 'node:fs';
import path from 'node:path';

import { getCurrentDirname } from 'src/common/file-utils';

import { startApp } from './utils/app-lifecycle';

jest.setTimeout(30000);

describe('startApp integration', () => {
  const entryPath = path.resolve(
    process.cwd(),
    'dist',
    'src',
    'testing-main.js',
  );
  const logsDirectory = path.join(getCurrentDirname(), 'logs');
  const logFilePath = path.join(logsDirectory, 'start-app.e2e.log');

  beforeAll(() => {
    if (!fs.existsSync(logsDirectory)) {
      fs.mkdirSync(logsDirectory, { recursive: true });
    }
  });

  it('throws when the built test entrypoint is missing', async () => {
    if (!fs.existsSync(entryPath)) {
      throw new Error(
        `Expected built file at ${entryPath} to exist. Run 'npm run build' before running this test.`,
      );
    }

    const backup = `${entryPath}.bak`;

    try {
      fs.renameSync(entryPath, backup);
      await expect(startApp(logFilePath)).rejects.toThrow(
        /Built test entrypoint not found/,
      );
    } finally {
      // restore
      if (fs.existsSync(backup)) {
        fs.renameSync(backup, entryPath);
      }
    }
  });

  it('rejects when the test entrypoint exits immediately', async () => {
    if (!fs.existsSync(entryPath)) {
      throw new Error(
        `Expected built file at ${entryPath} to exist. Run 'npm run build' before running this test.`,
      );
    }

    const original = fs.readFileSync(entryPath, 'utf8');
    try {
      // write a tiny script that exits immediately
      fs.writeFileSync(
        entryPath,
        "console.log('early-exit'); process.exit(0);\n",
        'utf8',
      );

      await expect(startApp(logFilePath)).rejects.toThrow(
        /exited early|App process failed to start/,
      );
    } finally {
      // restore original
      fs.writeFileSync(entryPath, original, 'utf8');
    }
  });
});
