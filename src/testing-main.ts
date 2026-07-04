/**
 * Testing application entrypoint.
 *
 * Loads `.test.env` and applies test-focused bootstrap options so production
 * bootstrapping stays free of test-only branches.
 */
import * as dotenv from 'dotenv';

export async function startTest(): Promise<void> {
  dotenv.config({ path: '.test.env' });
  const { bootstrap } = await import('./bootstrap');
  await bootstrap({ bufferLogs: false, host: '127.0.0.1' });
}

// Start the application only when the file is executed directly. This allows
// tests to import `startTest` without automatically starting the server, while
// allowing `node dist/src/testing-main.js` to start the app for E2E runs.
// Use dynamic evaluation to avoid TypeScript compilation issues with import.meta in CommonJS.
if (isRunningDirectly()) {
  void (async (): Promise<void> => {
    dotenv.config({ path: '.test.env' });
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

function isRunningDirectly(): boolean {
  try {
    const getCurrentFilename = new Function(
      'return import.meta.filename',
    ) as () => string;
    return process.argv[1] === getCurrentFilename();
  } catch {
    // Running in CommonJS environment; check whether this module is the entry point
    return typeof require !== 'undefined' && require.main === module;
  }
}
