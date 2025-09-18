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
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: false,
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
    responseTimeout: 15000,
    pageLoadTimeout: 30000,
    setupNodeEvents(on, config) {
      // LambdaTest specific setup
      on('task', {
        log(message) {
          console.log(message)
          return null
        },
      })

      // Enhanced error handling for LambdaTest
      on('before:browser:launch', (_browser, launchOptions) => {
        if (
          _browser.name === 'chrome' ||
          _browser.name === 'chromium' ||
          _browser.name === 'edge'
        ) {
          launchOptions.args.push('--disable-web-security')
          launchOptions.args.push('--disable-features=VizDisplayCompositor')
        }

        // Firefox-specific configuration
        if (_browser.name === 'firefox') {
          // Firefox doesn't support disabling web security like Chrome
          // Add Firefox-specific stability flags if needed
          launchOptions.args.push('--new-instance')
          launchOptions.args.push('--foreground')
        }

        // Safari/WebKit configuration for LambdaTest
        if (_browser.name === 'safari' || _browser.name === 'webkit') {
          // Safari-specific flags for LambdaTest cloud testing
          // LambdaTest handles Safari through their cloud infrastructure
          console.log('Running on Safari via LambdaTest cloud')
          // Don't add any local browser flags for Safari
          return launchOptions
        }

        return launchOptions
      })

      // Skip code coverage for LambdaTest to avoid dependency issues
      // Code coverage is handled in local/CI unit tests

      return config
    },
    env: {
      // LambdaTest environment variables
      lambdatest: true,
      // Pass through required environment variables
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      E2B_API_KEY: process.env.E2B_API_KEY,
      NODE_ENV: process.env.NODE_ENV || 'test',
      CYPRESS_TEST_EMAIL: process.env.CYPRESS_TEST_EMAIL || 'cypress-test@example.com',
      CYPRESS_TEST_PASSWORD: process.env.CYPRESS_TEST_PASSWORD || 'CypressTest123!',
    },
  },

  modifyObstructiveCode: false,
  retries: {
    runMode: 2,
    openMode: 0,
  },
})
