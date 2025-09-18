/// <reference types="cypress" />
/// <reference path="../support/index.d.ts" />

describe('Simple Test - Debugging Hanging Issues', () => {
  it('should load homepage quickly', () => {
    cy.visit('/')
    cy.get('body').should('be.visible')
    cy.log('✅ Homepage loaded successfully')
  })

  it('should check basic page elements', () => {
    cy.visit('/')
    cy.get('body').should('be.visible')

    // Check for common elements without specific selectors
    cy.get('html').should('have.attr', 'lang')
    cy.get('title').should('exist')
    cy.get('body').should('not.be.empty')

    cy.log('✅ Basic elements check passed')
  })

  it('should test navigation without authentication', () => {
    cy.visit('/')
    cy.get('body').should('be.visible')

    // Try to find any links and click one (if exists)
    cy.get('body').then(($body) => {
      const links = $body.find('a[href]')
      if (links.length > 0) {
        cy.get('a[href]').first().click()
        cy.get('body').should('be.visible')
        cy.log('✅ Navigation test passed')
      } else {
        cy.log('ℹ️ No navigation links found')
      }
    })
  })

  it('should test with minimal timeout', () => {
    cy.visit('/', { timeout: 5000 })
    cy.get('body', { timeout: 3000 }).should('be.visible')
    cy.log('✅ Fast timeout test passed')
  })

  it('should test API health endpoint (if exists)', () => {
    cy.request({
      url: '/api/health',
      failOnStatusCode: false,
    }).then((response) => {
      if (response.status === 200) {
        cy.log('✅ Health endpoint is working')
      } else {
        cy.log(`ℹ️ Health endpoint returned ${response.status}`)
      }
    })
  })
})
