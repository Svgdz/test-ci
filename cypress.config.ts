/// <reference types="cypress" />
/// <reference types="cypress-wait-until" />
/// <reference path="./src/__test__/support/index.d.ts" />

import { defineConfig } from 'cypress'

export default defineConfig({
  experimentalWebKitSupport: true,
  e2e: {
    supportFile: 'src/__test__/support/e2e.ts',
    specPattern: 'src/__test__/e2e/**/*.cy.{js,jsx,ts,tsx}',
    setupNodeEvents(on, config) {
      return config
    },
  },

  modifyObstructiveCode: false,
  retries: {
    runMode: 2,
    openMode: 0,
  },
})
