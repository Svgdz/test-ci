/// <reference types="cypress" />
/// <reference path="./index.d.ts" />

// Cypress E2E support file
// This file is processed and loaded automatically before your test files

import './commands'
import 'cypress-wait-until'

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Hide fetch/XHR requests from command log
const app = window.top
if (app && !app.document.head.querySelector('[data-hide-command-log-request]')) {
  const style = app.document.createElement('style')
  style.innerHTML = '.command-name-request, .command-name-xhr { display: none }'
  style.setAttribute('data-hide-command-log-request', '')
  app.document.head.appendChild(style)
}

// Global error handling for uncaught exceptions
Cypress.on('uncaught:exception', (err, _runnable) => {
  // Returning false here prevents Cypress from failing the test
  // for certain expected errors (like network errors during development)

  // Don't fail on network errors
  if (err.message.includes('Network Error')) {
    return false
  }

  // Don't fail on ResizeObserver errors (common in React apps)
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false
  }

  // Don't fail on hydration mismatches during development
  if (err.message.includes('Hydration failed')) {
    return false
  }

  // Don't fail on environment variable related errors in test environment
  if (err.message.includes('Missing required environment variables')) {
    console.warn('Environment variable error caught:', err.message)
    return false
  }

  // Don't fail on LambdaTest specific errors
  if (err.message.includes('lambdatest') || err.message.includes('tunnel')) {
    return false
  }

  // Let other errors fail the test
  return true
})

// Custom viewport commands
Cypress.Commands.add('setMobileViewport', () => {
  cy.viewport(375, 667) // iPhone 6/7/8 size
})

Cypress.Commands.add('setTabletViewport', () => {
  cy.viewport(768, 1024) // iPad size
})

Cypress.Commands.add('setDesktopViewport', () => {
  cy.viewport(1280, 720) // Desktop size
})

// Wait for application to be ready
Cypress.Commands.add('waitForApp', () => {
  cy.visit('/', { timeout: 10000 })
  cy.get('body').should('be.visible')

  // Wait for React hydration and initial render
  cy.get('main, [data-testid="app-content"], #__next').should('be.visible', { timeout: 5000 })
})

// Custom commands are declared in src/__test__/support/index.d.ts
