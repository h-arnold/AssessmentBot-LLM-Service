/**
 * Production application entrypoint.
 *
 * Bootstrapping for tests lives in `src/testing-main.ts` so we can keep
 * test-specific configuration out of the runtime entrypoint.
 */
import process from 'node:process';

import * as dotenv from 'dotenv';

/**
 * Start the production application.
 */
export async function start(): Promise<void> {
  dotenv.config({ path: '.env' });
  const { bootstrap } = await import('./bootstrap');
  await bootstrap();
}

// Start the application only when the file is executed directly. This allows
// tests to import `start` without automatically starting the server, while still
// allowing `node dist/src/main.js` to start the app.
if (isRunningDirectly()) {
  void (async (): Promise<void> => {
    try {
      await start();
    } catch (error: unknown) {
      process.stderr.write(
        `Failed to bootstrap application: ${String(error)}\n`,
      );
      process.exitCode = 1;
    }
  })();
}

/**
 * Check whether the current module is the main entry point.
 * @returns {boolean} True if the module is the main entry point and not running
 *   under Jest.
 */
function isRunningDirectly(): boolean {
  return (
    typeof require !== 'undefined' &&
    require.main === module &&
    !process.env.JEST_WORKER_ID
  );
}
