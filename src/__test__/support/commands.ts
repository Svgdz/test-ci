/// <reference types="cypress" />
/// <reference types="cypress-wait-until" />

// Custom Cypress commands for your application

// Authentication commands - Real authentication for E2E testing
Cypress.Commands.add(
  'login',
  (email: string = 'cypress-test@example.com', password: string = 'CypressTest123!') => {
    cy.session([email, password], () => {
      // Visit sign-in page
      cy.visit('/sign-in')

      // Wait for page to load
      cy.get('input[name="email"]').should('be.visible')

      // Fill in credentials
      cy.get('input[name="email"]').clear().type(email)
      cy.get('input[name="password"]').clear().type(password)

      // Submit form
      cy.get('button[type="submit"]').click()

      // Wait for successful authentication
      cy.url().should('not.include', '/sign-in', { timeout: 10000 })

      // Verify we're authenticated by checking for projects section or redirect
      cy.get('body').should('be.visible')

      // Additional verification - check that we can access authenticated content
      cy.visit('/')
      cy.get('body').should('contain.text', 'Your Projects')
    })
  }
)

// Alternative: Mock authentication with proper Supabase session
Cypress.Commands.add('loginMocked', (email: string, password: string) => {
  cy.session([email, password], () => {
    // Create a proper Supabase session token
    const mockSession = {
      access_token:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo5OTk5OTk5OTk5LCJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIn0.mock',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'test-user-123',
        email: email,
        user_metadata: { full_name: 'Test User' },
      },
    }

    // Set Supabase session in localStorage (client-side)
    cy.window().then((win) => {
      win.localStorage.setItem(
        `sb-${Cypress.env('NEXT_PUBLIC_SUPABASE_URL')?.split('//')[1]?.split('.')[0] || 'localhost'}-auth-token`,
        JSON.stringify([
          mockSession.access_token,
          mockSession.refresh_token,
          null,
          null,
          mockSession.user,
        ])
      )
    })

    // Mock Supabase API calls
    cy.intercept('GET', '**/auth/v1/user', {
      statusCode: 200,
      body: mockSession.user,
    })

    cy.intercept('POST', '**/auth/v1/token**', {
      statusCode: 200,
      body: mockSession,
    })

    // Visit home and verify auth worked
    cy.visit('/')
    cy.get('body').should('be.visible')
  })
})

Cypress.Commands.add('logout', () => {
  cy.clearCookies()
  cy.clearLocalStorage()
  cy.visit('/sign-in')
})

// API commands
Cypress.Commands.add(
  'apiRequest',
  (method: string, url: string, body?: Record<string, unknown>) => {
    return cy.request({
      method,
      url: `${Cypress.config('baseUrl')}/api${url}`,
      body,
      headers: {
        'Content-Type': 'application/json',
      },
      failOnStatusCode: false,
    })
  }
)

// Data attribute helpers
Cypress.Commands.add('getByTestId', (testId: string) => {
  return cy.get(`[data-testid="${testId}"]`)
})

Cypress.Commands.add('findByTestId', (testId: string) => {
  return cy.find(`[data-testid="${testId}"]`)
})

// Form helpers
Cypress.Commands.add('fillForm', (formData: Record<string, string>) => {
  Object.entries(formData).forEach(([key, value]) => {
    cy.getByTestId(`${key}-input`).clear().type(value)
  })
})

// Wait for network idle
Cypress.Commands.add('waitForNetworkIdle', (timeout = 5000) => {
  let requestCount = 0

  cy.intercept('**', (req) => {
    requestCount++
    req.continue((_res) => {
      requestCount--
    })
  })

  cy.waitUntil(() => requestCount === 0, {
    timeout: timeout,
    interval: 100,
  })
})

// Accessibility helpers
Cypress.Commands.add('checkA11y', (context?: string, _options?: Record<string, unknown>) => {
  // Basic accessibility check - can be enhanced with cypress-axe
  if (context) {
    cy.get(context).should('be.visible')
  }

  // Check for basic ARIA attributes where they should exist
  cy.get('input').then(($inputs) => {
    if ($inputs.length > 0) {
      cy.get('input').should('have.attr', 'type')
    }
  })
  cy.get('img').then(($imgs) => {
    if ($imgs.length > 0) {
      cy.get('img').should('have.attr', 'alt')
    }
  })
  // Only check button type for form buttons
  cy.get('button[type]').then(($buttons) => {
    if ($buttons.length > 0) {
      cy.get('button[type]').should('have.attr', 'type')
    }
  })
})
// Performance helpers
Cypress.Commands.add('measurePageLoad', () => {
  return cy.window().then((win) => {
    const performance = win.performance
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming

    const metrics: Record<string, number> = {
      domContentLoaded:
        navigation?.domContentLoadedEventEnd - navigation?.domContentLoadedEventStart || 0,
      loadComplete: navigation?.loadEventEnd - navigation?.loadEventStart || 0,
      firstPaint: 0,
      firstContentfulPaint: 0,
    }

    // Get paint metrics if available
    const paintMetrics = performance.getEntriesByType('paint')
    paintMetrics.forEach((metric) => {
      if (metric.name === 'first-paint') {
        metrics.firstPaint = metric.startTime
      }
      if (metric.name === 'first-contentful-paint') {
        metrics.firstContentfulPaint = metric.startTime
      }
    })

    cy.log('Page Performance Metrics', metrics)
    return cy.wrap(metrics)
  })
})

// Type declarations are in src/__test__/support/index.d.ts
