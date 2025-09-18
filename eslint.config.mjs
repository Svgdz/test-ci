import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'

import { FlatCompat } from '@eslint/eslintrc'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
})

const airbnbBase = compat.extends('airbnb-base')
const airbnbTypeScript = compat.extends('airbnb-typescript/base')

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.min.js',
      'src/ui/**',
      'src/__test__/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/cypress/**',
      'cypress/**',
    ],
  },

  eslint.configs.recommended,

  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: {
      import: importPlugin,
    },
    rules: {
      ...airbnbBase[0].rules,
    },
  },

  ...tseslint.configs.recommended,

  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  })),

  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      import: importPlugin,
    },
    rules: {
      ...airbnbTypeScript[0].rules,
      // Override deprecated rules that don't exist in newer @typescript-eslint versions
      '@typescript-eslint/lines-between-class-members': 'off',
      '@typescript-eslint/no-throw-literal': 'off',
      // React rules
      'react/require-default-props': 'off',
      // Disable import/extensions for TypeScript files (conflicts with TS compiler)
      'import/extensions': 'off',
      // Selectively disable only the most problematic rules
      '@typescript-eslint/no-unsafe-assignment': 'warn', // Warn instead of error
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }], // Allow void operator
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], // Allow _prefixed vars
      '@typescript-eslint/no-explicit-any': 'warn', // Warn instead of error
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            '**/*.test.*',
            '**/*.config.*',
            '**/vitest.config.*',
            '**/__test__/**',
            '**/cypress/**',
            '**/*.cy.*',
          ],
        },
      ],
      'react/require-default-props': 'off',
    },
  },

  {
    files: ['**/*.{js,jsx,cjs,mjs}'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Relaxed rules for test files
  {
    files: ['**/__test__/**/*', '**/*.test.*', '**/*.spec.*', '**/cypress/**/*', '**/*.cy.*'],
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Common test patterns
      '@typescript-eslint/no-shadow': 'off', // Common in test callbacks
      '@typescript-eslint/no-unused-expressions': 'off', // Cypress assertions
      '@typescript-eslint/no-unused-vars': 'off', // Test setup variables
      '@typescript-eslint/no-require-imports': 'off', // Dynamic imports in tests
    },
  },

  eslintConfigPrettier,
]
