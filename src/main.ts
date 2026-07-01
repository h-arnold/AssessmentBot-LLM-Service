/**
 * Production application entrypoint.
 *
 * Bootstrapping for tests lives in `src/testing-main.ts` so we can keep
 * test-specific configuration out of the runtime entrypoint.
 */
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

export async function start(): Promise<void> {
  const { bootstrap } = await import('./bootstrap');
  await bootstrap();
}

// Start the application only when the file is executed directly. This allows
// tests to import `start` without automatically starting the server, while still
// allowing `node dist/src/main.js` to start the app.
if (typeof require !== 'undefined' && require.main === module) {
  // Start and handle failures explicitly rather than using `void` which hides
  // rejections. We do not use top-level await here due to current TS config.
  start().catch((error: unknown) => {
    console.error('Failed to bootstrap application:', error);
    process.exit(1);
  });
}
