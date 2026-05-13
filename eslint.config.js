import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['.astro/', 'dist/', 'node_modules/'],
  },
  {
    languageOptions: {
      globals: {
        CustomEvent: 'readonly',
        DOMException: 'readonly',
        Response: 'readonly',
        fetch: 'readonly',
        globalThis: 'readonly',
        performance: 'readonly',
        window: 'readonly',
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
];
