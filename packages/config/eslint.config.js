// Shared flat ESLint config for all LifeOS TypeScript packages.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const base = tseslint.config(
  { ignores: ['dist/**', '.next/**', 'coverage/**', 'node_modules/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },
  prettier,
);

/** Same rules with browser globals, for the web (and later mobile) apps. */
export const browser = [...base, { languageOptions: { globals: { ...globals.browser } } }];

export default base;
