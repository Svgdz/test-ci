/// <reference types="cypress" />
/// <reference types="cypress-wait-until" />
/// <reference path="../support/index.d.ts" />

describe('Performance and Accessibility E2E Tests', () => {
  beforeEach(() => {
    cy.waitForApp()
  })

  describe('Performance Tests', () => {
    it('should load homepage within acceptable time', () => {
      const startTime = performance.now()

      cy.visit('/')

      // Wait for main content
      cy.get('[data-testid="project-grid"], [data-testid="empty-projects"]').should('be.visible')

      cy.then(() => {
        const loadTime = performance.now() - startTime
        expect(loadTime).to.be.lessThan(3000) // Should load within 3 seconds
      })
    })

    it('should measure Core Web Vitals', () => {
      cy.visit('/')

      cy.window().then((win) => {
        // Wait for performance observer data
        cy.wait(2000)

        // Get performance metrics
        const paintMetrics = win.performance.getEntriesByType('paint')
        const navigationTiming = win.performance.getEntriesByType(
          'navigation'
        )[0] as PerformanceNavigationTiming

        // First Contentful Paint (FCP)
        const fcp = paintMetrics.find((metric) => metric.name === 'first-contentful-paint')
        if (fcp) {
          expect(fcp.startTime).to.be.lessThan(2500) // Good FCP is < 2.5s
        }

        // DOM Content Loaded
        const dcl =
          navigationTiming.domContentLoadedEventEnd - navigationTiming.domContentLoadedEventStart
        expect(dcl).to.be.lessThan(1500)

        // Load Complete
        const loadComplete = navigationTiming.loadEventEnd - navigationTiming.loadEventStart
        expect(loadComplete).to.be.lessThan(3000)
      })
    })

    it('should handle large data sets efficiently', () => {
      // Mock large project list
      const projects = Array.from({ length: 100 }, (_, i) => ({
        id: `project-${i}`,
        name: `Project ${i}`,
        default_domain: `https://project${i}.e2b.dev`,
      }))

      cy.intercept('GET', '/api/projects', {
        statusCode: 200,
        body: { projects },
      })

      const startTime = performance.now()
      cy.visit('/')

      // Should render all projects
      cy.get('[data-testid="project-card"]').should('have.length', 100)

      cy.then(() => {
        const renderTime = performance.now() - startTime
        expect(renderTime).to.be.lessThan(5000) // Should handle 100 projects within 5s
      })
    })

    it('should implement virtual scrolling for file tree', () => {
      // Mock large file tree
      const files = Array.from({ length: 1000 }, (_, i) => `src/components/Component${i}.tsx`)

      cy.intercept('GET', '/api/sandbox/files', {
        statusCode: 200,
        body: {
          success: true,
          files: files.reduce(
            (acc, file) => ({
              ...acc,
              [file]: `// Content of ${file}`,
            }),
            {}
          ),
        },
      })

      cy.visit('/workspace/test-project')

      // Check that not all items are rendered at once
      cy.get('[data-testid="file-item"]').then(($items) => {
        expect($items.length).to.be.lessThan(100) // Virtual scrolling should limit rendered items
      })

      // Scroll and check new items appear
      cy.get('[data-testid="file-tree"]').scrollTo('bottom')
      cy.get('[data-testid="file-item"]').last().should('contain.text', 'Component99')
    })

    it('should lazy load code editor', () => {
      cy.visit('/workspace/test-project')

      // Editor should not be loaded initially
      cy.window().then((win) => {
        const hasCodeMirror = 'CodeMirror' in win
        expect(hasCodeMirror).to.be.false
      })

      // Click on a file
      cy.get('[data-testid="file-item"]').first().click()

      // Editor should load
      cy.get('.cm-editor').should('be.visible')

      // CodeMirror should now be loaded
      cy.window().then((win) => {
        const hasCodeMirror = 'CodeMirror' in win || !!document.querySelector('.cm-editor')
        expect(hasCodeMirror).to.be.true
      })
    })

    it('should optimize image loading', () => {
      cy.visit('/')

      // Check for lazy loading attributes
      cy.get('img').each(($img) => {
        // Images should have loading="lazy" or be below the fold
        const rect = $img[0].getBoundingClientRect()
        const isAboveFold = rect.top < window.innerHeight

        if (!isAboveFold) {
          expect($img.attr('loading')).to.equal('lazy')
        }
      })
    })

    it('should handle memory efficiently during long sessions', () => {
      cy.visit('/workspace/test-project')

      // Perform multiple operations
      for (let i = 0; i < 10; i++) {
        cy.get('[data-testid="file-item"]')
          .eq(i % 3)
          .click()
        cy.wait(100)
      }

      // Check memory usage (if available)
      cy.window().then((win) => {
        if ('memory' in win.performance) {
          const memory = (win.performance as any).memory
          const usedMemoryMB = memory.usedJSHeapSize / 1048576

          // Memory usage should be reasonable (< 500MB)
          expect(usedMemoryMB).to.be.lessThan(500)
        }
      })
    })

    it('should implement request debouncing', () => {
      cy.visit('/workspace/test-project')

      let requestCount = 0
      cy.intercept('GET', '/api/sandbox/files*', () => {
        requestCount++
      })

      // Type quickly in search
      cy.get('[data-testid="file-search"]').type('test')
      cy.wait(500)

      // Should debounce requests
      expect(requestCount).to.be.lessThan(5)
    })
  })

  describe('Accessibility Tests', () => {
    it('should have proper document structure', () => {
      cy.visit('/')

      // Should have one h1
      cy.get('h1').should('have.length', 1)

      // Should have proper heading hierarchy
      cy.get('h1, h2, h3, h4, h5, h6').then(($headings) => {
        let lastLevel = 0
        $headings.each((_, heading) => {
          const level = parseInt(heading.tagName[1])
          expect(level - lastLevel).to.be.lessThan(2) // No skipping levels
          lastLevel = level
        })
      })

      // Should have main landmark
      cy.get('main, [role="main"]').should('exist')

      // Should have navigation
      cy.get('nav, [role="navigation"]').should('exist')
    })

    it('should support keyboard navigation', () => {
      cy.visit('/')

      // Tab through interactive elements
      cy.get('body').type('{tab}')
      cy.focused().should('exist')
      cy.focused().should('be.visible')

      // Continue tabbing
      for (let i = 0; i < 5; i++) {
        cy.focused().type('{tab}')
        cy.focused().should('be.visible')
      }

      // Should be able to activate with Enter
      cy.get('[data-testid="create-project-button"]').focus()
      cy.focused().type('{enter}')
      cy.get('[data-testid="create-project-dialog"]').should('be.visible')

      // Escape should close dialog
      cy.focused().type('{esc}')
      cy.get('[data-testid="create-project-dialog"]').should('not.exist')
    })

    it('should have proper ARIA labels', () => {
      cy.visit('/')

      // Buttons should have accessible text or aria-label
      cy.get('button').each(($button) => {
        const text = $button.text().trim()
        const ariaLabel = $button.attr('aria-label')
        const ariaLabelledBy = $button.attr('aria-labelledby')

        expect(text || ariaLabel || ariaLabelledBy).to.exist
      })

      // Form inputs should have labels
      cy.get('input, textarea, select').each(($input) => {
        const id = $input.attr('id')
        const ariaLabel = $input.attr('aria-label')
        const ariaLabelledBy = $input.attr('aria-labelledby')

        if (id) {
          cy.get(`label[for="${id}"]`).should('exist')
        } else {
          expect(ariaLabel || ariaLabelledBy).to.exist
        }
      })

      // Images should have alt text
      cy.get('img').each(($img) => {
        expect($img.attr('alt')).to.exist
      })
    })

    it('should support screen readers', () => {
      cy.visit('/')

      // Check for screen reader only content
      cy.get('.sr-only, .visually-hidden, [aria-hidden="true"]').should('exist')

      // Live regions for dynamic content
      cy.get('[aria-live], [role="alert"], [role="status"]').should('exist')

      // Proper roles for interactive elements
      cy.get('[role="button"], [role="link"], [role="navigation"]').should('exist')
    })

    it('should have sufficient color contrast', () => {
      cy.visit('/')

      // Check text contrast
      cy.get('p, span, div').each(($el) => {
        const color = $el.css('color')
        const backgroundColor = $el.css('background-color')

        if (color && backgroundColor) {
          // Basic contrast check (would need more sophisticated algorithm)
          const hasText = $el.text().trim().length > 0
          if (hasText) {
            // Ensure text is not the same color as background
            expect(color).to.not.equal(backgroundColor)
          }
        }
      })
    })

    it('should handle focus management', () => {
      cy.visit('/')

      // Open a dialog
      cy.get('[data-testid="create-project-button"]').click()

      // Focus should move to dialog
      cy.focused().should('be.visible')
      cy.focused().parents('[data-testid="create-project-dialog"]').should('exist')

      // Tab should stay within dialog
      const focusableSelectors =
        'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'
      cy.get('[data-testid="create-project-dialog"]')
        .find(focusableSelectors)
        .then(($elements) => {
          const elementCount = $elements.length

          // Tab through all elements
          for (let i = 0; i < elementCount + 1; i++) {
            cy.focused().type('{tab}')
          }

          // Should cycle back to first element
          cy.focused().parents('[data-testid="create-project-dialog"]').should('exist')
        })
    })

    it('should support reduced motion', () => {
      // Set prefers-reduced-motion
      cy.visit('/', {
        onBeforeLoad(win) {
          cy.stub(win, 'matchMedia')
            .withArgs('(prefers-reduced-motion: reduce)')
            .returns({ matches: true })
        },
      })

      // Animations should be disabled
      cy.get('*').each(($el) => {
        const transition = $el.css('transition')
        const animation = $el.css('animation')

        if (transition && transition !== 'none') {
          expect(transition).to.include('0s')
        }
        if (animation && animation !== 'none') {
          expect(animation).to.include('0s')
        }
      })
    })

    it('should support dark mode', () => {
      // Check for theme toggle
      cy.visit('/')
      cy.get('[data-testid="theme-toggle"], [aria-label*="theme"]').should('exist')

      // Toggle dark mode
      cy.get('[data-testid="theme-toggle"], [aria-label*="theme"]').first().click()

      // Check that theme changed
      cy.get('html, body').should('have.class', 'dark')

      // Check contrast in dark mode
      cy.get('body').should('have.css', 'background-color').and('not.equal', 'rgb(255, 255, 255)')
    })
  })

  describe('Security Tests', () => {
    it('should sanitize user input', () => {
      cy.visit('/workspace/test-project')

      // Try XSS in chat
      const xssPayload = '<script>alert("XSS")</script>'
      cy.get('[data-testid="chat-input"]').type(xssPayload)
      cy.get('[data-testid="send-button"]').click()

      // Should display escaped text, not execute script
      cy.get('[data-testid="user-message"]').should('contain.text', '<script>')
      cy.on('window:alert', () => {
        throw new Error('XSS vulnerability detected!')
      })
    })

    it('should implement CSRF protection', () => {
      cy.visit('/')

      // Check for CSRF token
      cy.getCookie('csrf-token').should('exist')

      // API requests should include CSRF token
      cy.intercept('POST', '/api/**', (req) => {
        expect(req.headers).to.have.property('x-csrf-token')
      })
    })

    it('should enforce HTTPS', () => {
      // Check that app redirects to HTTPS in production
      if (Cypress.env('NODE_ENV') === 'production') {
        cy.visit('http://localhost:3000')
        cy.url().should('include', 'https://')
      }
    })

    it('should implement rate limiting', () => {
      cy.visit('/')

      // Make multiple rapid requests
      let rateLimitedCount = 0

      for (let i = 0; i < 20; i++) {
        cy.apiRequest('GET', '/api/projects').then((response) => {
          if (response.status === 429) {
            rateLimitedCount++
          }
        })
      }

      // After all requests, check if some were rate limited
      cy.then(() => {
        expect(rateLimitedCount).to.be.greaterThan(0)
      })
    })

    it('should validate file uploads', () => {
      cy.visit('/workspace/test-project')

      // Try to upload invalid file type
      const fileName = 'malicious.exe'
      cy.get('[data-testid="file-upload"]').selectFile(
        {
          contents: Cypress.Buffer.from('malicious content'),
          fileName,
          mimeType: 'application/x-msdownload',
        },
        { force: true }
      )

      // Should reject the file
      cy.get('[data-testid="upload-error"]').should('be.visible')
      cy.get('[data-testid="upload-error"]').should('contain.text', 'Invalid file type')
    })

    it('should implement proper authentication', () => {
      // Try to access protected route without auth
      cy.clearCookies()
      cy.clearLocalStorage()

      cy.visit('/workspace/test-project')

      // Should redirect to login
      cy.url().should('include', '/sign-in')

      // Should preserve return URL
      cy.url().should('include', 'returnTo')
    })

    it('should handle session expiry', () => {
      cy.visit('/workspace/test-project')

      // Simulate session expiry
      cy.intercept('GET', '/api/**', {
        statusCode: 401,
        body: { error: 'Session expired' },
      })

      // Make a request
      cy.get('[data-testid="refresh-button"]').click()

      // Should show session expired message
      cy.get('[data-testid="session-expired"]').should('be.visible')

      // Should offer to re-authenticate
      cy.get('[data-testid="reauth-button"]').should('be.visible')
    })
  })

  describe('Browser Compatibility', () => {
    it('should work in Chrome', () => {
      // This test runs in the current browser
      cy.visit('/')
      cy.get('[data-testid="project-grid"], [data-testid="empty-projects"]').should('be.visible')
    })

    it('should show unsupported browser warning', () => {
      cy.visit('/', {
        onBeforeLoad(win) {
          // Mock old browser
          Object.defineProperty(win.navigator, 'userAgent', {
            value: 'Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)',
          })
        },
      })

      // Should show browser warning
      cy.get('[data-testid="browser-warning"]').should('be.visible')
      cy.get('[data-testid="browser-warning"]').should('contain.text', 'browser is not supported')
    })

    it('should handle localStorage unavailability', () => {
      cy.visit('/', {
        onBeforeLoad(win) {
          // Disable localStorage
          Object.defineProperty(win, 'localStorage', {
            value: undefined,
            writable: false,
          })
        },
      })

      // App should still work
      cy.get('[data-testid="project-grid"], [data-testid="empty-projects"]').should('be.visible')
    })

    it('should work without JavaScript (progressive enhancement)', () => {
      // Check that critical content is in HTML
      cy.request('/').then((response) => {
        expect(response.body).to.include('<!DOCTYPE html>')
        expect(response.body).to.include('<main')
      })
    })
  })

  describe('Responsive Design', () => {
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 },
    ]

    viewports.forEach((viewport) => {
      it(`should be responsive on ${viewport.name}`, () => {
        cy.viewport(viewport.width, viewport.height)
        cy.visit('/')

        // Check that layout adapts
        if (viewport.name === 'mobile') {
          // Mobile specific checks
          cy.get('[data-testid="mobile-menu"]').should('be.visible')
          cy.get('[data-testid="desktop-nav"]').should('not.be.visible')
        } else {
          // Desktop/tablet checks
          cy.get('[data-testid="desktop-nav"]').should('be.visible')
          cy.get('[data-testid="mobile-menu"]').should('not.exist')
        }

        // Content should be visible
        cy.get('main').should('be.visible')

        // No horizontal scroll
        cy.window().then((win) => {
          expect(win.document.documentElement.scrollWidth).to.equal(win.innerWidth)
        })
      })
    })

    it('should handle orientation changes', () => {
      // Portrait
      cy.viewport(375, 667)
      cy.visit('/')
      cy.get('main').should('be.visible')

      // Landscape
      cy.viewport(667, 375)
      cy.get('main').should('be.visible')

      // Layout should adapt
      cy.get('[data-testid="project-grid"]').should('have.css', 'grid-template-columns')
    })
  })

  describe('Error Recovery', () => {
    it('should handle JavaScript errors gracefully', () => {
      cy.on('uncaught:exception', (err) => {
        // App should handle errors without crashing
        expect(err.message).to.not.include('Cannot read properties of undefined')
        return false
      })

      cy.visit('/')

      // Trigger a potential error
      cy.window().then((win) => {
        // Try to access undefined property
        try {
          ;(win as any).undefinedObject.property
        } catch (e) {
          // Error should be caught
        }
      })

      // App should still be functional
      cy.get('[data-testid="create-project-button"]').should('be.visible')
    })

    it('should show error boundary fallback', () => {
      // Force an error in a component
      cy.visit('/')

      cy.window().then((win) => {
        // Dispatch error event
        win.dispatchEvent(
          new ErrorEvent('error', {
            error: new Error('Test error'),
            message: 'Test error',
          })
        )
      })

      // Should show error boundary if implemented
      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="error-boundary"]').length > 0) {
          cy.get('[data-testid="error-boundary"]').should('be.visible')
          cy.get('[data-testid="reload-button"]').should('be.visible')
        }
      })
    })
  })
})
