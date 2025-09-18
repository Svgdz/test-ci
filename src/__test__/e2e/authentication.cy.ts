/// <reference types="cypress" />
/// <reference types="cypress-wait-until" />

// Authentication flow E2E tests
describe('Authentication Flow', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('body').should('be.visible')
  })

  it('should display sign-in form', () => {
    cy.visit('/sign-in')
    cy.url().should('include', '/sign-in')

    // Check for basic form elements based on actual implementation
    cy.get('form').should('be.visible')
    cy.get('input#email').should('be.visible')
    cy.get('input#password').should('be.visible')
    cy.get('button[type="submit"]').should('be.visible')
    cy.contains('Sign in').should('be.visible')
  })

  it('should display sign-up form', () => {
    cy.visit('/sign-up')
    cy.url().should('include', '/sign-up')

    // Check for basic form elements based on actual implementation
    cy.get('form').should('be.visible')
    cy.get('input#email').should('be.visible')
    cy.get('input#password').should('be.visible')
    cy.get('button[type="submit"]').should('be.visible')
    cy.contains('Sign up').should('be.visible')
  })

  it('should navigate between auth pages', () => {
    cy.visit('/sign-in')
    cy.url().should('include', '/sign-in')

    // Navigate directly to sign-up page
    cy.visit('/sign-up')
    cy.url().should('include', '/sign-up')
    cy.get('form').should('be.visible')

    // Navigate back to sign-in page
    cy.visit('/sign-in')
    cy.url().should('include', '/sign-in')
    cy.get('form').should('be.visible')
  })

  it('should handle forgot password flow', () => {
    cy.visit('/forgot-password')
    cy.url().should('include', '/forgot-password')

    // Check for email input
    cy.get('input#email').should('be.visible')
    cy.get('button[type="submit"]').should('be.visible')
  })

  it('should validate email format in sign-in form', () => {
    cy.visit('/sign-in')

    // Try to submit with invalid email
    cy.get('input#email').type('invalid-email')
    cy.get('input#password').type('password123')
    cy.get('button[type="submit"]').click()

    // Should show validation error or stay on page
    cy.url().should('include', '/sign-in')
  })

  it('should validate password requirements in sign-up form', () => {
    cy.visit('/sign-up')

    // Fill form with weak password
    cy.get('input#email').type('test@example.com')
    cy.get('input#password').type('123') // Too short

    // Check if there's a confirm password field and fill it
    cy.get('body').then(($body) => {
      if ($body.find('input#confirmPassword, input#confirm-password').length > 0) {
        cy.get('input#confirmPassword, input#confirm-password').first().type('123')
      }
    })

    cy.get('button[type="submit"]').click()

    // Should stay on sign-up page (validation should prevent submission)
    cy.url().should('include', '/sign-up')
  })

  it('should handle form submission with empty fields', () => {
    cy.visit('/sign-in')

    // Try to submit empty form
    cy.get('button[type="submit"]').click()

    // Should stay on sign-in page
    cy.url().should('include', '/sign-in')
  })

  it('should handle responsive design on mobile', () => {
    cy.viewport(375, 667) // Mobile viewport

    cy.visit('/sign-in')
    cy.get('form').should('be.visible')
    cy.get('input#email').should('be.visible')
    cy.get('input#password').should('be.visible')
    cy.get('button[type="submit"]').should('be.visible')

    // Form should be usable on mobile
    cy.get('input#email').type('test@example.com')
    cy.get('input#password').type('password123')
  })

  it('should handle API errors gracefully', () => {
    cy.visit('/sign-in')

    // Mock API error
    cy.intercept('POST', '/api/auth/**', { statusCode: 500, body: { error: 'Server Error' } })

    cy.get('input#email').type('test@example.com')
    cy.get('input#password').type('password123')
    cy.get('button[type="submit"]').click()

    // Should handle error gracefully
    cy.url().should('include', '/sign-in')
    cy.get('body').should('be.visible')
  })

  it('should preserve returnTo parameter in URL', () => {
    const returnTo = '/workspace/my-project'

    // Visit sign-in with returnTo parameter
    cy.visit(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`)

    // Should preserve returnTo in URL
    cy.url().should('include', 'returnTo')
    cy.url().should('include', encodeURIComponent(returnTo))
  })

  it('should handle keyboard navigation', () => {
    cy.visit('/sign-in')

    // Focus on first form element
    cy.get('input#email').focus()
    cy.focused().should('have.attr', 'id', 'email')

    // Type email and move to password field
    cy.get('input#email').type('test@example.com')
    cy.get('input[type="password"]').focus()
    cy.focused().should('have.attr', 'type', 'password')

    // Type password and move to submit button
    cy.focused().type('password123')
    cy.get('button[type="submit"]').focus()
    cy.focused().should('have.attr', 'type', 'submit')

    // Enter should submit the form
    cy.focused().type('{enter}')
  })

  it('should have proper form labels', () => {
    cy.visit('/sign-in')

    // Check that inputs have proper labels or placeholders
    cy.get('input#email').should('have.attr', 'placeholder')
    cy.get('input#password').should('have.attr', 'placeholder')

    // Check for heading
    cy.get('h1, h2').should('exist')
  })
})
