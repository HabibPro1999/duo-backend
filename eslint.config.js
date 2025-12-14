import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Module boundary enforcement
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/modules/identity/**', '!**/modules/identity/index.js'],
            message: 'Import from @identity barrel, not internal files'
          },
          {
            group: ['**/modules/clients/**', '!**/modules/clients/index.js'],
            message: 'Import from @clients barrel, not internal files'
          }
        ]
      }]
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js'],
  }
);
