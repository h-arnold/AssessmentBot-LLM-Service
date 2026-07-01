import * as fs from 'node:fs';

/**
 * Represents a single log entry object parsed from the application's log file.
 * Contains request, response, error, and metadata fields.
 */
export interface LogObject {
  /**
   * Request information, if present.
   */
  req?: {
    id?: string;
    method?: string;
    url?: string;
    headers?: {
      authorization?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  /**
   * Response information, if present.
   */
  res?: {
    statusCode?: number;
    [key: string]: unknown;
  };
  /**
   * Time taken to process the request, in milliseconds.
   */
  responseTime?: number;
  /**
   * Log message string.
   */
  msg?: string;
  /**
   * Log level (number or string).
   */
  level?: number | string;
  /**
   * Error information, if present.
   */
  err?: {
    type?: string;
    message?: string;
    stack?: string;
    [key: string]: unknown;
  };
  /**
   * Timestamp of the log entry (epoch ms).
   */
  time?: number;
  /**
   * Any additional fields.
   */
  [key: string]: unknown;
}

/**
 * Reads a log file and parses each line as a LogObject.
 *
 * @param logFilePath - The path to the log file to read.
 * @returns An array of LogObject entries parsed from the file.
 */
export function getLogObjects(logFilePath: string): LogObject[] {
  if (!fs.existsSync(logFilePath)) {
    return [];
  }
  const logContent = fs.readFileSync(logFilePath, 'utf8');
  return logContent
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      try {
        return JSON.parse(line) as LogObject;
      } catch (error) {
        // A log line may be written incrementally; skip malformed lines but log them for visibility
        console.error(
          `Failed to parse JSON log line ${index}: ${line}`,
          Error.isError(error) ? error.message : String(error),
        );
        return null;
      }
    })
    .filter((o): o is LogObject => o !== null);
}

/**
 * Waits until a log entry matching the given predicate appears in the log file, or times out.
 *
 * @param logFilePath - The path to the log file to monitor.
 * @param predicate - A function that returns true for the desired log entry.
 * @param timeoutMs - The maximum time to wait in milliseconds.
 * @throws If the timeout is reached before a matching log is found.
 */
export async function waitForLog(
  logFilePath: string,
  predicate: (log: LogObject) => boolean,
  timeoutMs = 30000,
  signal?: AbortSignal,
): Promise<void> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;

    const clearTimer = (): void => {
      if (timer == null) {
      	return;
      }

      clearTimeout(timer);
      timer = null;
    };

    const onAbort = (): void => {
      clearTimer();
      reject(new Error('waitForLog aborted'));
    };

    if (signal?.aborted) {
      return reject(new Error('waitForLog aborted'));
    }

    if (signal) {
      signal.addEventListener('abort', onAbort);
    }

    const cleanup = (): void => {
      clearTimer();
      if (signal) {
        try {
          signal.removeEventListener('abort', onAbort);
        } catch (error) {
          // Log rather than silently ignore to aid debugging flakes
          console.debug('Failed to remove abort listener:', error);
        }
      }
    };

    const checkLog = (): void => {
      let logs: LogObject[];
      try {
        logs = getLogObjects(logFilePath);
      } catch (error) {
        // Defensive: ensure we clean up timers/listeners and surface a descriptive error
        cleanup();
        const errorMessage = Error.isError(error) ? error.message : String(error);
        console.error(
          `waitForLog encountered an error while reading logs: ${errorMessage}`,
        );
        reject(new Error(`waitForLog failed while parsing logs: ${errorMessage}`));
        return;
      }

      if (logs.some((l) => predicate(l))) {
        cleanup();
        resolve();
        return;
      }

      if (Date.now() - startTime > timeoutMs) {
        cleanup();
        if (fs.existsSync(logFilePath)) {
          const logContent = fs.readFileSync(logFilePath, 'utf8');
          console.error(
            `waitForLog timed out. Log file contents (last 1000 chars):\n`,
            logContent.slice(-1000),
          );
        } else {
          console.error('waitForLog timed out. Log file does not exist.');
        }
        reject(new Error(`waitForLog timed out after ${timeoutMs}ms`));
        return;
      }

      timer = setTimeout(checkLog, 100); // Poll every 100ms
    };

    checkLog();
  });
}
