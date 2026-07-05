/**
 * Testing application entrypoint.
 *
 * Loads `.test.env` and applies test-focused bootstrap options so production
 * bootstrapping stays free of test-only branches.
 */
import process from 'node:process';

import * as dotenv from 'dotenv';

/**
 * Start the testing application.
 */
export async function startTest(): Promise<void> {
  dotenv.config({ path: '.test.env' });
  const { bootstrap } = await import('./bootstrap');
  await bootstrap({ bufferLogs: false, host: '127.0.0.1' });
}

// Start the application only when the file is executed directly. This allows
// tests to import `startTest` without automatically starting the server, while
// allowing `node dist/src/testing-main.js` to start the app for E2E runs.
if (isRunningDirectly()) {
  void (async (): Promise<void> => {
    try {
      await startTest();
    } catch (error: unknown) {
      process.stderr.write(
        `Failed to bootstrap test application: ${String(error)}\n`,
      );
      process.exit(1);
    }
  })();
}

/**
 * Check whether the current module is the main entry point.
 * @returns {boolean} True if the module is the main entry point.
 */
function isRunningDirectly(): boolean {
  return typeof require !== 'undefined' && require.main === module;
}
