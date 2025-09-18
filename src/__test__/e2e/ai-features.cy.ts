/// <reference types="cypress" />
/// <reference types="cypress-wait-until" />
/// <reference path="../support/index.d.ts" />

import { testScenarios } from '../helpers/test-data'

describe('AI Code Generation E2E Tests', () => {
  beforeEach(() => {
    /* Ignore syntax errors during app loading */
    cy.on('uncaught:exception', (err) => {
      if (err.message.includes('SyntaxError')) {
        return false
      }
    })
  })

  describe('Public AI Interface (Unauthenticated)', () => {
    it('should display the main prompt textarea on homepage', () => {
      cy.visit('/')
      cy.get('body').should('be.visible')

      /* Check for the actual prompt textarea */
      cy.get('textarea[name="prompt"]').should('be.visible')
      cy.get('textarea[placeholder="Enter your prompt here..."]').should('be.visible')

      /* Check for the submit button */
      cy.get('button[type="submit"]').should('be.visible').should('contain.text', 'Get Started')

      /* Check for the main heading */
      cy.contains('what are we building').should('be.visible')
    })

    it('should redirect to sign-in when submitting prompt without authentication', () => {
      cy.visit('/')

      /* Fill in the prompt textarea */
      cy.get('textarea[name="prompt"]').type('Build a simple todo app')

      /* Submit the form */
      cy.get('button[type="submit"]').click()

      /* Should redirect to sign-in page with return URL */
      cy.url().should('include', '/sign-in')
      cy.url().should('include', 'returnTo=')

      /* Check that the returnTo parameter contains the encoded prompt */
      cy.url().then((url) => {
        const urlObj = new URL(url)
        const returnTo = urlObj.searchParams.get('returnTo')
        expect(returnTo).to.include('prompt=')
        expect(decodeURIComponent(returnTo || '')).to.include('Build a simple todo app')
      })
    })

    it('should handle keyboard shortcuts in textarea', () => {
      cy.visit('/')

      /* Test Enter key submits form */
      cy.get('textarea[name="prompt"]').type('Test prompt{enter}')
      cy.url().should('include', '/sign-in')

      /* Go back and test Shift+Enter for new line */
      cy.visit('/')
      cy.get('textarea[name="prompt"]').clear().type('Line 1{shift+enter}Line 2')
      cy.get('textarea[name="prompt"]').should('contain.value', 'Line 1\nLine 2')
    })
  })

  describe('Authenticated AI Features', () => {
    beforeEach(() => {
      /* Login with test account before each authenticated test */
      cy.login(Cypress.env('CYPRESS_TEST_EMAIL'), Cypress.env('CYPRESS_TEST_PASSWORD'))
    })

    it('should create real project when authenticated user submits prompt', () => {
      cy.visit('/')

      /* Wait for authentication state to be established */
      cy.contains('Your Projects').should('be.visible')

      /* Intercept to monitor the real API call */
      cy.intercept('POST', '/api/projects').as('createProject')

      /* Fill in prompt */
      cy.get('textarea[name="prompt"]').type('Build a simple todo app with React')

      /* Ensure button is enabled before clicking */
      cy.get('button[type="submit"]').should('not.be.disabled')

      /* Submit the form */
      cy.get('button[type="submit"]').click()

      /* The main test: verify the API call is made and succeeds */
      cy.wait('@createProject', { timeout: 120000 }).then((interception) => {
        expect(interception.response?.statusCode).to.equal(200)
        expect(interception.response?.body).to.have.property('type', 'redirect')
        expect(interception.response?.body).to.have.property('projectId')
        expect(interception.response?.body).to.have.property('initialPrompt')

        cy.log(`Project created with ID: ${interception.response?.body.projectId}`)
      })

      /* Should redirect to workspace with real project ID */
      cy.url({ timeout: 30000 }).should('include', '/workspace/')
      cy.url().should('match', /\/workspace\/[a-f0-9-]{36}/)
    })

    it('should display real user projects when authenticated', () => {
      /* Intercept to monitor the real API call */
      cy.intercept('GET', '/api/projects').as('getProjects')

      cy.visit('/')

      /* Wait for real projects to load */
      cy.wait('@getProjects').then((interception) => {
        expect(interception.response?.statusCode).to.equal(200)

        const projects = interception.response?.body?.projects || []

        if (projects.length > 0) {
          /* Should show projects section with real data */
          cy.contains(`Your Projects (${projects.length})`).should('be.visible')

          /* Check first project appears */
          if (projects[0]?.name) {
            cy.contains(projects[0].name).should('be.visible')
          }
        } else {
          /* Should show empty state */
          cy.contains('No projects yet.').should('be.visible')
        }
      })
    })

    it('should show toast notifications during project creation', () => {
      cy.visit('/')

      /* Wait for authentication state to be established */
      cy.contains('Your Projects').should('be.visible')

      /* Fill in prompt and submit */
      cy.get('textarea[name="prompt"]').type('Build a weather app')
      cy.get('button[type="submit"]').click()

      /* Should show loading toast */
      cy.contains('Creating project...').should('be.visible')

      /* Wait for completion and success toast - E2B sandbox creation takes time */
      cy.contains('Project ready', { timeout: 120000 }).should('be.visible')
    })

    it('should handle real workspace navigation after project creation', () => {
      cy.visit('/')

      /* Wait for authentication state to be established */
      cy.contains('Your Projects').should('be.visible')

      /* Create a project */
      cy.get('textarea[name="prompt"]').type('Build a calculator app')
      cy.get('button[type="submit"]').click()

      /* Wait for redirect to workspace - E2B sandbox creation and setup takes time */
      cy.url({ timeout: 120000 }).should('include', '/workspace/')

      /* Should be in the workspace page */
      cy.get('body').should('be.visible')

      /* Check for workspace elements (without being too specific about layout) */
      cy.get('body').then(($body) => {
        const hasFileTree = $body.find('[data-testid*="file"], .file-tree, nav').length > 0
        const hasEditor = $body.find('textarea, .editor, .monaco').length > 0
        const hasWorkspaceContent =
          $body.text().includes('Files') || $body.text().includes('Editor')

        /* Should have some workspace-like content */
        expect(hasFileTree || hasEditor || hasWorkspaceContent).to.be.true

        cy.log(
          `Workspace indicators - File tree: ${hasFileTree}, Editor: ${hasEditor}, Content: ${hasWorkspaceContent}`
        )
      })
    })
  })

  describe('Error Handling', () => {
    it('should validate empty prompts', () => {
      cy.visit('/')

      /* Submit button should be disabled for empty prompt */
      cy.get('button[type="submit"]').should('be.disabled')

      /* Type and clear prompt */
      cy.get('textarea[name="prompt"]').type('test').clear()
      cy.get('button[type="submit"]').should('be.disabled')

      /* Add valid prompt */
      cy.get('textarea[name="prompt"]').type('Build an app')
      cy.get('button[type="submit"]').should('not.be.disabled')
    })

    it('should handle authentication errors during project creation', () => {
      /* Test without login to see authentication handling */
      cy.visit('/')

      cy.get('textarea[name="prompt"]').type('Test authentication error')
      cy.get('button[type="submit"]').click()

      /* Should redirect to sign-in for unauthenticated user */
      cy.url().should('include', '/sign-in')
    })
  })

  describe('Responsive Design', () => {
    it('should work on mobile devices', () => {
      cy.viewport(375, 667)
      cy.visit('/')

      /* Main elements should be visible */
      cy.get('textarea[name="prompt"]').should('be.visible')
      cy.get('button[type="submit"]').should('be.visible')
      cy.contains('what are we building').should('be.visible')
    })

    it('should work on tablet devices', () => {
      cy.viewport(768, 1024)
      cy.visit('/')

      /* Main elements should be visible */
      cy.get('textarea[name="prompt"]').should('be.visible')
      cy.get('button[type="submit"]').should('be.visible')
    })
  })
})
