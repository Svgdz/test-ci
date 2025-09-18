/// <reference types="cypress" />
/// <reference types="cypress-wait-until" />
/// <reference path="./src/__test__/support/index.d.ts" />

import { defineConfig } from 'cypress'

export default defineConfig({
  experimentalWebKitSupport: true,
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
    supportFile: 'src/__test__/support/e2e.ts',
    specPattern: 'src/__test__/e2e/**/*.cy.{js,jsx,ts,tsx}',
    setupNodeEvents(on, config) {
      return config
    },
    env: {
      // LambdaTest environment variables
      lambdatest: true,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      E2B_API_KEY: process.env.E2B_API_KEY,
      NODE_ENV: process.env.NODE_ENV || 'test',
      CYPRESS_TEST_EMAIL: process.env.CYPRESS_TEST_EMAIL || 'cypress-test@example.com',
      CYPRESS_TEST_PASSWORD: process.env.CYPRESS_TEST_PASSWORD || 'CypressTest123!',
    },
  },
})
