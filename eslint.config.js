import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import jest from 'eslint-plugin-jest';
import n from 'eslint-plugin-n';
import noSecrets from 'eslint-plugin-no-secrets';
import regexp from 'eslint-plugin-regexp';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', '**/*.cjs'],
  },
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      '@stylistic': stylistic,
      jest,
      'no-secrets': noSecrets,
      n,
      regexp,
      security,
      sonarjs,
      'import-x': importPlugin,
    },
  },
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
        ...globals.jest,
      },
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
    files: ['test/**/*.ts', 'src/**/*.spec.ts'], // Apply type-aware rules and Jest rules to test files
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './jest-e2e.config.cjs'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...jest.configs.recommended.rules, // Apply Jest recommended rules
      // You might want to add more specific rules for test files here
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

      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
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
            '^data:image\\/png;base64,',
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
    },
  },
  {
    files: ['**/*.cjs'],
    rules: {
      'import-x/no-commonjs': 'off',
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
