/**
 * Testing application entrypoint.
 *
 * Loads `.test.env` and applies test-focused bootstrap options so production
 * bootstrapping stays free of test-only branches.
 */
import * as dotenv from 'dotenv';

dotenv.config({ path: '.test.env' });

export async function startTest(): Promise<void> {
  const { bootstrap } = await import('./bootstrap');
  await bootstrap({ bufferLogs: false, host: '127.0.0.1' });
}

// Start the application only when the file is executed directly. This allows
// tests to import `startTest` without automatically starting the server, while
// allowing `node dist/src/testing-main.js` to start the app for E2E runs.
if (typeof require !== 'undefined' && require.main === module) {
  // Start and handle failures explicitly rather than using `void` which hides
  // rejections. We do not use top-level await here due to current TS config.
  startTest().catch((error: unknown) => {
    console.error('Failed to bootstrap test application:', error);
    process.exit(1);
  });
}
