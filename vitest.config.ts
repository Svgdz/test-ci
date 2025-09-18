import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__test__/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '.next/**', 'src/__test__/e2e/**', 'cypress/**'],
    include: ['src/__test__/**/*.test.{ts,tsx,js,jsx}', 'src/__test__/**/*.spec.{ts,tsx,js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/__test__/',
        '**/*.d.ts',
        '**/*.config.*',
        'src/types/',
        'coverage/',
        'dist/',
        '.next/',
        'cypress/',
        'public/',
        'scripts/',
        'src/types/database.types.ts',
      ],
      include: [
        'src/**/*.{ts,tsx,js,jsx}',
        '!src/**/*.test.{ts,tsx,js,jsx}',
        '!src/**/*.spec.{ts,tsx,js,jsx}',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    env: {
      NODE_ENV: 'test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      E2B_API_KEY: 'test-e2b-key',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/__test__': path.resolve(__dirname, './src/__test__'),
    },
  },
})
