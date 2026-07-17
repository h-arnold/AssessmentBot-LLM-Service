import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import jsdoc from 'eslint-plugin-jsdoc';
import n from 'eslint-plugin-n';
import noSecrets from 'eslint-plugin-no-secrets';
import regexp from 'eslint-plugin-regexp';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'coverage', '**/*.mjs'],
  },
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      '@stylistic': stylistic,
      jsdoc,
      'no-secrets': noSecrets,
      n,
      regexp,
      security,
      sonarjs,
      unicorn,
      'import-x': importPlugin,
    },
  },
  // Apply unicorn's complete rule set (modern JS preferences)
  unicorn.configs['flat/all'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // project: true, // This will be enabled in a separate config for src files
        // tsconfigRootDir: import.meta.dirname, // This will be enabled in a separate config for src files
      },
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
    plugins: {
      sonarjs,
    },
    rules: {
      // unicorn rules customisation (mirrors the frontend config)
      'unicorn/no-array-for-each': 'off',
      'unicorn/catch-error-name': 'error',
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': 'warn',
      'unicorn/no-keyword-prefix': 'off',
      'unicorn/filename-case': 'off',
      // Additional overrides appropriate for this NestJS backend
      'unicorn/no-asterisk-prefix-in-documentation-comments': 'off',
      'unicorn/name-replacements': 'warn',
      'unicorn/comment-content': 'off',
      'unicorn/switch-case-braces': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/consistent-boolean-name': 'off',
      // Error.isError is only typed in lib.esnext.error.d.ts (Stage 3 TC39 proposal,
      // not yet part of any released ECMAScript standard). Using it requires adding
      // "ESNext" to the compilerOptions.lib array, which pulls in all unstable/future
      // type definitions — an unacceptable trade-off just to satisfy this rule.
      // The sole advantage of Error.isError over instanceof Error is handling
      // cross-realm errors (from iframes or Node.js vm modules). This is a NestJS
      // backend running in a single Node.js process with no vm module usage, so
      // cross-realm errors cannot occur. instanceof Error is the idiomatic,
      // fully type-safe, and sufficient approach here.
      'unicorn/prefer-error-is-error': 'off',
      'unicorn/no-process-exit': 'off',
      'unicorn/prefer-temporal': 'off',
      'unicorn/consistent-class-member-order': 'off',
      'unicorn/max-nested-calls': 'warn',
    },
  },
  {
    rules: {
      ...sonarjs.configs.recommended.rules,
    },
  },
  {
    files: ['src/**/*.ts'], // Apply type-aware rules only to src TypeScript files
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...tseslint.configs.recommendedTypeChecked.rules, // Use type-checked recommended rules
      ...security.configs.recommended.rules, // Apply security rules that might need type info
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
      'security/detect-object-injection': 'warn',
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-all-duplicated-branches': 'warn',
      'sonarjs/no-duplicated-branches': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-ignored-return': 'warn',
      'sonarjs/no-redundant-boolean': 'warn',
      'sonarjs/prefer-object-literal': 'warn',
    },
  },
  {
    files: ['test/**/*.ts', 'src/**/*.spec.ts'], // Apply type-aware rules to test files
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {},
  },
  // Override @typescript-eslint/no-unsafe-* rules for spec files.
  // NestJS's @Injectable() decorator prevents the type checker from fully
  // resolving the constructor/method types of decorated classes. Any attempt
  // to create instances in tests (via TestingModule.get(), Object.create(),
  // or direct construction) leaves the value "tainted from any" in the
  // typescript-eslint type tracker, even after explicit `as` casts. These
  // warnings are unavoidable when testing NestJS @Injectable()-decorated
  // classes and provide no real safety value — a test that compiles and runs
  // correctly is the proper safety check. See also:
  // https://github.com/nestjs/nest/issues/13191
  {
    files: ['src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    rules: {
      ...tseslint.configs.recommended.rules, // General TypeScript rules (non-type-aware)
      ...prettier.rules,

      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-eval': 'error',

      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling']],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],

      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'globalThis',
          property: 'console',
          message:
            'Use the NestJS Logger (from @nestjs/common) as the only logging boundary.',
        },
      ],
      'no-irregular-whitespace': [
        'error',
        { skipComments: false, skipStrings: false, skipTemplates: false },
      ],
      'no-secrets/no-secrets': [
        'error',
        {
          tolerance: 4.5,
          additionalRegexes: {
            'Potential API key': 'AIza[0-9A-Za-z-_]{35}',
          },
          ignoreContent: [
            'test-key',
            'test-api-key',
            String.raw`^data:image\/png;base64,`,
            'your_database_url_here',
            'your_api_key_here',
          ],
        },
      ],
      'security/detect-eval-with-expression': 'error',
      'prefer-promise-reject-errors': 'error',
      'regexp/no-dupe-disjunctions': 'error',
      'regexp/no-invisible-character': 'error',
      'regexp/no-super-linear-backtracking': 'error',
      'regexp/no-useless-escape': 'error',
      'regexp/optimal-quantifier-concatenation': 'error',
      'n/no-deprecated-api': 'error',
      'n/no-path-concat': 'error',
      '@typescript-eslint/no-var-requires': 'error',
      'import-x/no-commonjs': 'error',

      // JSDoc rules to enforce documentation standards
      // Use TypeScript-specific recommended config — it disables type
      // annotations in JSDoc blocks (TypeScript already provides types)
      // and enables no-types to flag redundant annotations
      ...jsdoc.configs['flat/recommended-typescript'].rules,
      // Override check-tag-names to avoid warnings for conventional
      // NestJS documentation tags (@module, @class, @abstract, @property)
      // that are redundant in TypeScript but idiomatic in this codebase
      'jsdoc/check-tag-names': ['warn', { typed: false }],
      'jsdoc/no-types': 'off',
      'jsdoc/require-description-complete-sentence': 'error',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-returns-description': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-example': 'off',
      'jsdoc/require-description': 'error',
      'jsdoc/require-throws-description': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/test/**'],
              message:
                'Import shared test helpers only from spec files or src/test support files.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.spec.ts', 'src/test/**'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // `unicorn/prefer-uint8array-base64` is disabled for the files below.
  //
  // Root cause: the rule recommends `Uint8Array.prototype.toBase64()` /
  // `Uint8Array.fromBase64()` over `Buffer.prototype.toString('base64')` /
  // `Buffer.from(…, 'base64')`. However, those `Uint8Array` base64 methods are
  // NOT available at runtime in the Node.js version shipped for this project.
  // Verified empirically on Node 24:
  //   typeof Buffer.prototype.toBase64 === 'undefined'
  //   typeof Uint8Array.prototype.toBase64 === 'undefined'
  // TypeScript's bundled lib typings falsely declare these methods, so the code
  // compiles and lints as written, but calling them at runtime throws
  // `TypeError: …toBase64 is not a function`. This is the exact defect that
  // previously surfaced as HTTP 500s on IMAGE Buffer requests (CODE_REVIEW.md
  // Latent Bug HIGH, fixed by converting Buffers to `data:` URIs via
  // `Buffer.prototype.toString('base64')`).
  //
  // The correct, runtime-safe call in this environment is
  // `Buffer.prototype.toString('base64')` (and `Buffer.from(…, 'base64')`), which
  // is what these files use. Once the project's Node.js runtime ships a
  // `Uint8Array.prototype.toBase64()` implementation, this override can be
  // removed and the calls migrated back to the native API.
  {
    files: [
      'src/common/pipes/image-validation.pipe.ts',
      'src/common/pipes/image-validation.pipe.spec.ts',
      'src/common/utils/crypto.utilities.ts',
      'src/auth/api-key.service.spec.ts',
      'src/config/environment.schema.spec.ts',
      'src/prompt/prompt.factory.ts',
      'src/prompt/prompt.factory.spec.ts',
      'vitest.setup.ts',
      'test/assessor-live.e2e-spec.ts',
      'test/assessor.e2e-spec.ts',
      'test/auth.e2e-spec.ts',
    ],
    rules: {
      'unicorn/prefer-uint8array-base64': 'off',
    },
  },
  // `unicorn/custom-error-definition` is disabled for the centralised LLM error
  // library below.
  //
  // Root cause: the rule requires custom `Error` subclasses to declare `options`
  // as the SECOND constructor parameter (e.g. `constructor(message, options?)`),
  // forwarding it to `super()`. This conflicts with the deliberate constructor
  // contract for the `LlmError` hierarchy, documented in
  // `docs/llm/error-handling.md` ("Adding a New LLM Provider"). Every concrete
  // `LlmError` subclass uses a POSITIONAL second argument:
  //
  //   constructor(
  //     message: string,
  //     providerName: string,
  //     options?: { originalError?: Error; cause?: Error },
  //   )
  //
  // The positional `providerName` is a required argument so that providers can
  // construct errors naturally
  // (`new ResourceExhaustedError('msg', 'gemini', { originalError })`). The
  // abstract `LlmError` base itself (`constructor(httpStatus, message, retryable,
  // providerName, options?)`) lints clean under the rule, but the concrete
  // subclasses fail because their second parameter is named `providerName` rather
  // than `options`.
  //
  // This is an established, product-driven reason: the documented error-handling
  // contract is the source of truth for how these error classes are constructed
  // and consumed, and the rule's `options`-second convention cannot be satisfied
  // without abandoning the positional `providerName`. The lint gate remains
  // enforced everywhere else; only this error-handling library is exempt. If the
  // documented contract is ever revised to adopt the `options`-second shape, this
  // override should be removed.
  {
    files: ['src/common/errors/**/*.ts'],
    rules: {
      'unicorn/custom-error-definition': 'off',
    },
  },
  // Scripts and prod-tests run outside the NestJS app — console output is legitimate
  {
    files: ['scripts/**', 'prod-tests/**'],
    rules: {
      'no-console': 'off',
      'no-restricted-properties': 'off',
    },
  },
  {
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-var-requires': 'off',
      'import-x/no-commonjs': 'off',
    },
  },
);
