import * as fs from 'node:fs';
import * as path from 'node:path';

import { waitForLog, LogObject } from './utils/log-watcher';

jest.setTimeout(5000);

describe('log-watcher', () => {
  const logsDir = path.join(__dirname, 'logs');
  const logFilePath = path.join(logsDir, 'waitForLog.unit.log');

  beforeAll(() => {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    // Ensure the file exists empty
    fs.writeFileSync(logFilePath, '', 'utf-8');
  });

  afterAll(() => {
    try {
      if (fs.existsSync(logFilePath)) fs.unlinkSync(logFilePath);
    } catch (error) {
      // Log cleanup failures so CI flakes are easier to diagnose
      console.debug('Failed to cleanup test logs:', error);
    }
    try {
      if (fs.existsSync(logsDir)) fs.rmdirSync(logsDir);
    } catch (error) {
      // Log cleanup failures so CI flakes are easier to diagnose
      console.debug('Failed to remove logs dir:', error);
    }
  });

  it('is abortable via AbortSignal', async () => {
    const ac = new AbortController();
    const p = waitForLog(logFilePath, () => false, 3000, ac.signal);

    // Abort almost immediately
    ac.abort();

    await expect(p).rejects.toThrow(/waitForLog aborted/);
  });

  it('resolves when a matching log line appears', async () => {
    const predicate = (log: LogObject): boolean => log.msg === 'unit-ready';
    const p = waitForLog(logFilePath, predicate, 3000);

    // Append a valid JSON line after a short delay
    setTimeout((): void => {
      fs.appendFileSync(
        logFilePath,
        JSON.stringify({ msg: 'unit-ready' }) + '\n',
        'utf-8',
      );
    }, 50);

    await expect(p).resolves.toBeUndefined();
  });

  it('skips malformed lines and still resolves when valid line appears', async () => {
    const predicate = (log: LogObject): boolean =>
      log.msg === 'after-malformed';
    const p = waitForLog(logFilePath, predicate, 3000);

    // Append a malformed line then a valid line
    setTimeout((): void => {
      fs.appendFileSync(logFilePath, "{not: 'json'}\n", 'utf-8');
      fs.appendFileSync(
        logFilePath,
        JSON.stringify({ msg: 'after-malformed' }) + '\n',
        'utf-8',
      );
    }, 50);

    await expect(p).resolves.toBeUndefined();
  });
});
