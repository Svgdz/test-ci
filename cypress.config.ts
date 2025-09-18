/// <reference types="cypress" />
/// <reference types="cypress-wait-until" />
/// <reference path="./src/__test__/support/index.d.ts" />

import { defineConfig } from 'cypress'

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      return config
    },
    // Enable mochawesome reporter
    reporter: 'mochawesome',
    reporterOptions: {
      reportDir: 'cypress/results/mochawesome',
      overwrite: true,
      html: true,
      json: true,
    },
  },
})
