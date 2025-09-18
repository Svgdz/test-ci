export {}

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>
      logout(): Chainable<void>
      apiRequest(
        method: string,
        url: string,
        body?: Record<string, unknown>
      ): Chainable<Cypress.Response<unknown>>
      getByTestId(testId: string): Chainable<JQuery<HTMLElement>>
      findByTestId(testId: string): Chainable<JQuery<HTMLElement>>
      fillForm(formData: Record<string, string>): Chainable<void>
      waitForNetworkIdle(timeout?: number): Chainable<void>
      checkA11y(context?: string, options?: Record<string, unknown>): Chainable<void>
      measurePageLoad(): Chainable<Record<string, number>>
      setMobileViewport(): Chainable<void>
      setTabletViewport(): Chainable<void>
      setDesktopViewport(): Chainable<void>
      waitForApp(): Chainable<void>
    }
  }
}
