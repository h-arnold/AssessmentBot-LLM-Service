import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { getCurrentDirname } from 'src/common/file-utilities';

import { waitForLog } from './log-watcher';

const appLifecycleLogger = new Logger('AppLifecycle');

/**
 * Listener for child process stderr output.
 * @param {Buffer} data - The stderr data buffer.
 */
function stderrListener(data: Buffer): void {
  appLifecycleLogger.error(`stderr: ${data}`);
}

/**
 * Listener for child process stdout output.
 * @param {Buffer} data - The stdout data buffer.
 */
function stdoutListener(data: Buffer): void {
  appLifecycleLogger.debug(`stdout: ${data}`);
}

/**
 * Represents the running application instance during E2E tests.
 */
export interface AppInstance {
  appProcess: ChildProcessWithoutNullStreams;
  appUrl: string;
  apiKey: string;
  apiKey2: string;
  throttlerTtl: number;
  unauthenticatedThrottlerLimit: number;
  authenticatedThrottlerLimit: number;
}

/**
 * Starts the application in a child process for E2E testing, waits for it to
 * be ready, and returns process info.
 * @param {string} logFilePath - The path to the log file to use for the app
 *   process.
 * @param {Record<string, string>} [environmentOverrides] - A plain JavaScript
 *   object to override default environment variables.
 * @returns {Promise<AppInstance>} An object containing the app process, base
 *   URL, and API key.
 * @throws {Error} If the application fails to start within 30 seconds.
 */
export async function startApp(
  logFilePath: string,
  environmentOverrides: Record<string, string> = {},
): Promise<AppInstance> {
  // Ensure the log directory exists to avoid permission or ENOENT errors
  const logDirectory = path.dirname(logFilePath);
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
  }

  if (fs.existsSync(logFilePath)) {
    fs.truncateSync(logFilePath, 0);
  } else {
    // Touch the file to ensure it exists before pino/thread-stream opens it
    fs.closeSync(fs.openSync(logFilePath, 'a'));
  }

  const appEntryPath = path.join(
    getCurrentDirname(),
    'dist',
    'src',
    'testing-main.js',
  );

  // Load .test.env file
  const testEnvironmentPath = path.join(getCurrentDirname(), '.test.env');
  // Load .test.env if present; fall back to defaults otherwise
  const testEnvironmentConfig = fs.existsSync(testEnvironmentPath)
    ? dotenv.parse(fs.readFileSync(testEnvironmentPath))
    : {};

  // Define default values for the test run.
  const defaultTestValues = {
    NODE_ENV: 'test',
    PORT: '3001',
    LOG_FILE: logFilePath,
    GEMINI_API_KEY: 'dummy-key-for-testing', // Default dummy key
    API_KEYS: 'test-api-key,test-api-key-2',
    THROTTLER_TTL: '36000000',
    UNAUTHENTICATED_THROTTLER_LIMIT: '9',
    AUTHENTICATED_THROTTLER_LIMIT: '12',
    LLM_BACKOFF_BASE_MS: '2000', // Increased backoff for rate limiting (2 seconds instead of 1)
    LLM_MAX_RETRIES: '5', // Increased retries for rate limiting (5 instead of 3)
    LOG_LEVEL: 'debug',
  };

  // Merge environment variables: process.env < defaults < .test.env < overrides
  const testEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    ...defaultTestValues,
    ...testEnvironmentConfig,
    ...environmentOverrides,
  };

  if (
    process.env.E2E_MOCK_LLM === 'true' ||
    process.env.E2E_MOCK_LLM === 'false'
  ) {
    testEnvironment.E2E_MOCK_LLM = process.env.E2E_MOCK_LLM;
  }

  if (testEnvironment.E2E_MOCK_LLM === 'true') {
    const shimPath = path.join(
      getCurrentDirname(),
      'test',
      'utils',
      'llm-mock.mjs',
    );
    const shimUrl = pathToFileURL(shimPath).href;
    const existingNodeOptions = testEnvironment.NODE_OPTIONS ?? '';
    const shimOption = `--import=${shimUrl}`;
    testEnvironment.NODE_OPTIONS = existingNodeOptions
      ? `${existingNodeOptions} ${shimOption}`
      : shimOption;
  }

  // Ensure the built test entrypoint exists before attempting to spawn the process
  if (!fs.existsSync(appEntryPath)) {
    throw new Error(
      `Built test entrypoint not found at ${appEntryPath}. Have you run a build?`,
    );
  }

  const appProcess = spawn(process.execPath, [appEntryPath], {
    cwd: getCurrentDirname(),
    env: testEnvironment,
  });

  appProcess.stderr.on('data', stderrListener);

  const appUrl = 'http://localhost:3001';

  // Create a promise that rejects if the child process exits or fails to spawn
  const earlyExitPromise = new Promise<never>((_, reject) => {
    const errorListener = (error: Error): void => {
      appLifecycleLogger.error('App process failed to start:', error);
      // Include any existing log content to aid debugging
      let logTail = '';
      if (fs.existsSync(logFilePath)) {
        try {
          const lc = fs.readFileSync(logFilePath, 'utf8');
          logTail = lc.slice(-2000);
        } catch (error_) {
          logTail = `Failed to read log file: ${error_ instanceof Error ? error_.message : String(error_)}`;
        }
      }
      reject(
        new Error(
          `App process failed to start: ${error?.message ?? String(error)}\n\nRecent log tail:\n${logTail}`,
        ),
      );
    };

    // Log stdout as well to capture any helpful messages
    appProcess.stdout.on('data', stdoutListener);

    const exitListener = (code: number | null, signal: string | null): void => {
      appLifecycleLogger.error(
        `App process exited early with code=${code} signal=${signal}`,
      );
      // Include any existing log content to aid debugging
      let logTail = '';
      if (fs.existsSync(logFilePath)) {
        try {
          const lc = fs.readFileSync(logFilePath, 'utf8');
          logTail = lc.slice(-2000);
        } catch (error) {
          logTail = `Failed to read log file: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      reject(
        new Error(
          `App process exited early with code=${code} signal=${signal}\n\nRecent log tail:\n${logTail}`,
        ),
      );
    };

    appProcess.once('error', errorListener);
    appProcess.once('exit', exitListener);
  });

  // Use an AbortController so we can cancel the waiting poll if the process exits early
  const ac = new AbortController();

  try {
    // Race the log readiness check against early process exit so we fail fast with a helpful error
    await Promise.race([
      waitForLog(
        logFilePath,
        (log) =>
          typeof log.msg === 'string' &&
          log.msg.includes('Nest application successfully started'),
        30000,
        ac.signal,
      ),
      earlyExitPromise,
    ]);
  } catch (error) {
    // Abort the log poll if it's still running so timers are cleared promptly
    try {
      ac.abort();
    } catch (error_) {
      // Log abort failure for visibility
      appLifecycleLogger.debug('Abort controller abort failed:', error_);
    }

    appLifecycleLogger.error('Error during app startup:', error);
    // Ensure the process is killed if startup fails
    if (appProcess.pid) {
      appProcess.kill('SIGTERM');
    }
    throw error;
  }

  // Startup succeeded: remove the early-exit handlers and stdout/stderr listeners
  // (e.g. SIGTERM during test teardown) so they don't keep handles open.
  try {
    appProcess.removeAllListeners('error');
    appProcess.removeAllListeners('exit');
    appProcess.stdout.removeAllListeners('data');
    appProcess.stderr.removeAllListeners('data');
  } catch (error) {
    // Best-effort cleanup failed — log for diagnostics
    appLifecycleLogger.debug(
      'Failed to remove listeners during startup cleanup:',
      error,
    );
  }

  // Derive return values from the final, effective environment
  const [apiKey, apiKey2] = testEnvironment.API_KEYS!.split(',');

  return {
    appProcess,
    appUrl,
    apiKey,
    apiKey2,
    throttlerTtl: Number.parseInt(testEnvironment.THROTTLER_TTL!),
    unauthenticatedThrottlerLimit: Number.parseInt(
      testEnvironment.UNAUTHENTICATED_THROTTLER_LIMIT!,
    ),
    authenticatedThrottlerLimit: Number.parseInt(
      testEnvironment.AUTHENTICATED_THROTTLER_LIMIT!,
    ),
  };
}

/**
 * Stops the running application process by sending SIGTERM.
 * @param {ChildProcessWithoutNullStreams} appProcess - The child process
 *   running the application.
 */
export function stopApp(appProcess: ChildProcessWithoutNullStreams): void {
  if (!(appProcess && !appProcess.killed)) {
    return;
  }

  try {
    appProcess.kill('SIGTERM');
  } catch (error) {
    // Log failure to send SIGTERM so flakes are easier to diagnose
    appLifecycleLogger.debug('Failed to send SIGTERM to app process:', error);
  }

  // If the process doesn't exit within a short timeout, force kill it to prevent
  // CI hangs due to orphaned processes.
  const killTimer = setTimeout(() => {
    if (!appProcess.killed) {
      try {
        appProcess.kill('SIGKILL');
      } catch (error) {
        // Log force-kill failures for diagnostics
        appLifecycleLogger.debug('Failed to force-kill app process:', error);
      }
    }
  }, 5000);

  appProcess.once('exit', () => clearTimeout(killTimer));
}

export const API_CALL_DELAY_MS = 2000;

/**
 * Delays execution for a specified number of milliseconds.
 * Useful for rate limiting test API calls to avoid hitting Gemini API limits.
 * @param {number} ms - The number of milliseconds to delay.
 * @returns {Promise<void>} A promise that resolves after the delay.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
