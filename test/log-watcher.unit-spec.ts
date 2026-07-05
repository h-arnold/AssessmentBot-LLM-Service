import * as fs from 'node:fs';
import path from 'node:path';

import { Logger } from '@nestjs/common';
import { getCurrentDirname } from 'src/common/file-utilities';

import { waitForLog, LogObject } from './utils/log-watcher';

const logger = new Logger('LogWatcherUnit');

jest.setTimeout(5000);

/**
 * Predicate that matches log entries with msg 'unit-ready'.
 * @param {LogObject} log - The log object to check.
 * @returns {boolean} True if the log message is 'unit-ready'.
 */
function isUnitReady(log: LogObject): boolean {
  return log.msg === 'unit-ready';
}

/**
 * Predicate that matches log entries with msg 'after-malformed'.
 * @param {LogObject} log - The log object to check.
 * @returns {boolean} True if the log message is 'after-malformed'.
 */
function isAfterMalformed(log: LogObject): boolean {
  return log.msg === 'after-malformed';
}

describe('log-watcher', () => {
  const logsDirectory = path.join(getCurrentDirname(), 'logs');
  const logFilePath = path.join(logsDirectory, 'waitForLog.unit.log');

  beforeAll(() => {
    if (!fs.existsSync(logsDirectory)) {
      fs.mkdirSync(logsDirectory, { recursive: true });
    }
    // Ensure the file exists empty
    fs.writeFileSync(logFilePath, '', 'utf8');
  });

  afterAll(() => {
    if (fs.existsSync(logFilePath)) {
      try {
        fs.unlinkSync(logFilePath);
      } catch (error) {
        logger.debug('Failed to cleanup test logs:', error);
      }
    }
    if (fs.existsSync(logsDirectory)) {
      try {
        fs.rmdirSync(logsDirectory);
      } catch (error) {
        logger.debug('Failed to remove logs dir:', error);
      }
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
    const p = waitForLog(logFilePath, isUnitReady, 3000);

    // Append a valid JSON line after a short delay
    setTimeout((): void => {
      fs.appendFileSync(
        logFilePath,
        JSON.stringify({ msg: 'unit-ready' }) + '\n',
        'utf8',
      );
    }, 50);

    await expect(p).resolves.toBeUndefined();
  });

  it('skips malformed lines and still resolves when valid line appears', async () => {
    const p = waitForLog(logFilePath, isAfterMalformed, 3000);

    // Append a malformed line then a valid line
    setTimeout((): void => {
      fs.appendFileSync(logFilePath, "{not: 'json'}\n", 'utf8');
      fs.appendFileSync(
        logFilePath,
        JSON.stringify({ msg: 'after-malformed' }) + '\n',
        'utf8',
      );
    }, 50);

    await expect(p).resolves.toBeUndefined();
  });
});
