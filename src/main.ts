/**
 * Production application entrypoint.
 *
 * Bootstrapping for tests lives in `src/testing-main.ts` so we can keep
 * test-specific configuration out of the runtime entrypoint.
 */
import process from 'node:process';

import * as dotenv from 'dotenv';

/*eslint-disable unicorn/prefer-top-level-await */
export async function start(): Promise<void> {
  dotenv.config({ path: '.env' });
  const { bootstrap } = await import('./bootstrap');
  await bootstrap();
}

// Start the application only when the file is executed directly. This allows
// tests to import `start` without automatically starting the server, while still
// allowing `node dist/src/main.js` to start the app.
// Use dynamic evaluation to avoid TypeScript compilation issues with import.meta in CommonJS.
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

function isRunningDirectly(): boolean {
  try {
    const getCurrentFilename = new Function(
      'return import.meta.filename',
    ) as () => string;
    return process.argv[1] === getCurrentFilename();
  } catch {
    // Running in CommonJS environment; assume entry point in production
    return !process.env.JEST_WORKER_ID;
  }
}
