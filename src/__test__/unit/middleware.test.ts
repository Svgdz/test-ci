import { AUTH_URLS, PROTECTED_URLS } from '@/configs/urls'
import { middleware } from '@/middleware'
import { createServerClient } from '@supabase/ssr'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MOCKS SETUP
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}))

// Mock NextResponse to track redirects
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')

  const mockRedirect = vi.fn((url: URL | string) => {
    const response = new actual.NextResponse(null, {
      status: 307,
      headers: {
        location: url.toString(),
      },
    })
    Object.defineProperty(response, 'isRedirect', { value: true })
    Object.defineProperty(response, 'redirectUrl', { value: url.toString() })
    return response
  })

  const mockNext = vi.fn((_init?: { request?: NextRequest }) => {
    const response = new actual.NextResponse(null, { status: 200 })
    Object.defineProperty(response, 'isNext', { value: true })
    return response
  })

  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      redirect: mockRedirect,
      next: mockNext,
    },
  }
})

// NOTE: These are unit tests for middleware, not true integration tests
// They mock all external dependencies (Supabase auth)
// Consider moving to unit/middleware.test.ts
describe('Middleware Unit Tests', () => {
  let mockSupabase: { auth: { getUser: ReturnType<typeof vi.fn> } }
  let mockGetUser: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    mockGetUser = vi.fn()
    mockSupabase = {
      auth: {
        getUser: mockGetUser,
      },
    }

    vi.mocked(createServerClient).mockReturnValue(mockSupabase)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('AI Web App Generation Flow', () => {
    it('should redirect unauthenticated users from workspace routes to sign-in', async () => {
      mockGetUser.mockResolvedValue({
        error: new Error('Not authenticated'),
        data: { user: null },
      })

      const request = new NextRequest('http://localhost:3000/workspace/project-123')
      const response = await middleware(request)

      expect(response).toHaveProperty('isRedirect', true)
      expect(response).toHaveProperty('redirectUrl', 'http://localhost:3000/sign-in')
    })

    it('should redirect authenticated users from auth routes to landing page', async () => {
      mockGetUser.mockResolvedValue({
        error: null,
        data: { user: { id: 'user-123', email: 'test@example.com' } },
      })

      const request = new NextRequest('http://localhost:3000/sign-in')
      const response = await middleware(request)

      expect(response).toHaveProperty('isRedirect', true)
      expect(response).toHaveProperty('redirectUrl', 'http://localhost:3000/')
    })

    it('should allow authenticated users to access workspace routes', async () => {
      mockGetUser.mockResolvedValue({
        error: null,
        data: { user: { id: 'user-123', email: 'test@example.com' } },
      })

      const request = new NextRequest('http://localhost:3000/workspace/ai-project-456')
      const response = await middleware(request)

      expect(response).toHaveProperty('isNext', true)
      expect(response.status).toBe(200)
    })

    it('should allow unauthenticated users to access landing page with AI prompt', async () => {
      mockGetUser.mockResolvedValue({
        error: new Error('Not authenticated'),
        data: { user: null },
      })

      const request = new NextRequest('http://localhost:3000/')
      const response = await middleware(request)

      expect(response).toHaveProperty('isNext', true)
      expect(response.status).toBe(200)
    })

    it('should protect workspace creation (project generation)', async () => {
      mockGetUser.mockResolvedValue({
        error: new Error('Not authenticated'),
        data: { user: null },
      })

      const request = new NextRequest('http://localhost:3000/workspace/new-project')
      const response = await middleware(request)

      expect(response).toHaveProperty('isRedirect', true)
      expect(response).toHaveProperty('redirectUrl', 'http://localhost:3000/sign-in')
    })
  })

  describe('Route Detection', () => {
    it('should handle all auth routes correctly', async () => {
      mockGetUser.mockResolvedValue({
        error: null,
        data: { user: { id: 'user-123' } },
      })

      const authRoutes = [AUTH_URLS.SIGN_IN, AUTH_URLS.SIGN_UP, AUTH_URLS.FORGOT_PASSWORD]

      for (const route of authRoutes) {
        const request = new NextRequest(`http://localhost:3000${route}`)
        const response = await middleware(request)

        expect(response).toHaveProperty('isRedirect', true)
        expect(response).toHaveProperty('redirectUrl', 'http://localhost:3000/')
      }
    })

    it('should handle protected routes correctly', async () => {
      mockGetUser.mockResolvedValue({
        error: new Error('Not authenticated'),
        data: { user: null },
      })

      const protectedRoutes = [
        '/workspace/project-123',
        '/workspace/my-ai-app',
        PROTECTED_URLS.DASHBOARD,
        PROTECTED_URLS.ACCOUNT_SETTINGS,
      ]

      for (const route of protectedRoutes) {
        const request = new NextRequest(`http://localhost:3000${route}`)
        const response = await middleware(request)

        expect(response).toHaveProperty('isRedirect', true)
        expect(response).toHaveProperty('redirectUrl', `http://localhost:3000${AUTH_URLS.SIGN_IN}`)
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle Supabase errors gracefully', async () => {
      mockGetUser.mockRejectedValue(new Error('Database connection failed'))

      const request = new NextRequest('http://localhost:3000/workspace/project-123')
      const response = await middleware(request)

      expect(response).toHaveProperty('isNext', true)
      expect(response.status).toBe(200)
    })

    it('should handle malformed requests gracefully', async () => {
      mockGetUser.mockResolvedValue({
        error: null,
        data: { user: null },
      })

      const request = new NextRequest('http://localhost:3000/workspace/../admin')
      const response = await middleware(request)

      expect(response).toBeDefined()
    })
  })

  describe('Cookie Handling', () => {
    it('should properly set up Supabase client with cookies', async () => {
      mockGetUser.mockResolvedValue({
        error: null,
        data: { user: { id: 'user-123' } },
      })

      const request = new NextRequest('http://localhost:3000/workspace/my-project')
      request.cookies.set('sb-access-token', 'mock-token')

      await middleware(request)

      // createServerClient was called with proper cookie handlers
      // Environment variables may be undefined locally or strings in CI
      expect(createServerClient).toHaveBeenCalled()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const callArgs = (createServerClient as any).mock.calls[0]
      expect(callArgs).toHaveLength(3)
      // First two args are environment variables (undefined locally, strings in CI)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(typeof callArgs[0] === 'undefined' || typeof callArgs[0] === 'string').toBe(true)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(typeof callArgs[1] === 'undefined' || typeof callArgs[1] === 'string').toBe(true)
      // Third arg should be the config object
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(callArgs[2]).toEqual(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          cookies: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            getAll: expect.any(Function),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            setAll: expect.any(Function),
          }),
        })
      )
    })
  })
})
