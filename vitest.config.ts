import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Shared alias for `src/...` path-alias imports used by test files.
// Resolves to the TypeScript source (not dist) so tests exercise live code.
const sourceAlias = { src: path.resolve(process.cwd(), 'src') };

export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: './junit/vitest-junit.xml',
    coverage: {
      reporter: ['text', 'html', 'lcov', 'clover'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          root: '.',
          include: ['src/**/*.spec.ts', 'test/**/*.unit-spec.ts'],
          setupFiles: ['./vitest.setup.ts'],
          globals: true,
          alias: sourceAlias,
        },
      },
      {
        test: {
          name: 'e2e',
          root: '.',
          include: ['test/**/*.e2e-spec.ts'],
          exclude: ['test/**/*-live.e2e-spec.ts', 'test/prod-tests/**'],
          setupFiles: ['./vitest.setup.ts', './vitest.e2e.setup.ts'],
          globals: true,
          testTimeout: 30000,
          pool: 'forks',
          fileParallelism: false,
          alias: sourceAlias,
        },
      },
      {
        test: {
          name: 'e2e-live',
          root: '.',
          include: ['test/assessor-live.e2e-spec.ts'],
          setupFiles: ['./vitest.setup.ts'],
          globals: true,
          testTimeout: 30000,
          pool: 'forks',
          fileParallelism: false,
          alias: sourceAlias,
        },
      },
      {
        test: {
          name: 'prod',
          root: '.',
          include: ['test/prod-tests/**/*.production-spec.ts'],
          setupFiles: ['./vitest.setup.ts'],
          globals: true,
          testTimeout: 600000,
          pool: 'forks',
          fileParallelism: false,
          alias: sourceAlias,
        },
      },
    ],
  },
});
