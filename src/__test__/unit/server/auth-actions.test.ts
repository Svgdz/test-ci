import { AUTH_URLS } from '@/configs/urls'
import { encodedRedirect } from '@/lib/utils/auth'
import {
  forgotPasswordAction,
  signInAction,
  signInWithOAuthAction,
  signOutAction,
  signUpAction,
} from '@/server/auth/auth-actions'
import { redirect } from 'next/navigation'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Create mock functions that can be used throughout the file
const { validateEmail, shouldWarnAboutAlternateEmail } = vi.hoisted(() => ({
  validateEmail: vi.fn(),
  shouldWarnAboutAlternateEmail: vi.fn(),
}))

// Mock console.error to prevent output during tests
const originalConsoleError = console.error
console.error = vi.fn()

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
  },
}

// Mock dependencies
vi.mock('@/lib/clients/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

vi.mock('@/lib/clients/supabase/admin', () => ({
  supabaseAdmin: {
    auth: vi.fn(),
  },
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(() => ({
    get: vi.fn((key) => {
      if (key === 'origin') return 'https://localhost:3000'
      return null
    }),
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => ({ destination: url })),
}))

// Note: encodedRedirect is not mocked - it will naturally throw when calling redirect
// This prevents affecting other tests that need the real implementation

vi.mock('@/server/auth/validate-email', () => ({
  validateEmail,
  shouldWarnAboutAlternateEmail,
}))

// NOTE: These are unit tests for auth actions, not true integration tests
// They mock all external dependencies (Supabase, etc.)
// Consider moving to unit/server/auth-actions.test.ts
describe('Auth Actions Unit Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
    console.error = originalConsoleError
  })

  describe('Sign In Flow', () => {
    it('should redirect to dashboard on successful login', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      })

      await signInAction({
        email: 'test@example.com',
        password: 'password123',
      })

      expect(redirect).toHaveBeenCalledWith('/dashboard')
    })

    it('should redirect to workspace if returnTo is provided', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      })

      await signInAction({
        email: 'test@example.com',
        password: 'password123',
        returnTo: '/workspace/my-ai-project',
      })

      expect(redirect).toHaveBeenCalledWith('/workspace/my-ai-project')
    })

    it('should reject absolute URLs in returnTo for security', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      })

      const result = await signInAction({
        email: 'test@example.com',
        password: 'password123',
        returnTo: 'https://malicious-site.com/workspace/stolen-project',
      })

      expect(result?.validationErrors?.fieldErrors.returnTo).toBeDefined()
    })

    it('should reject malicious URLs in returnTo', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      })

      const result = await signInAction({
        email: 'test@example.com',
        password: 'password123',
        returnTo: 'javascript:alert("xss")',
      })

      expect(result?.validationErrors?.fieldErrors.returnTo).toBeDefined()
    })

    it('should handle invalid credentials', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
      })

      const result = await signInAction({
        email: 'test@example.com',
        password: 'wrongpassword',
      })

      expect(result?.serverError).toBe('Invalid credentials.')
    })

    it('should handle email validation errors', async () => {
      validateEmail.mockReturnValue({
        isValid: false,
        error: 'Valid email is required',
      })

      const result = await signInAction({
        email: 'invalid-email',
        password: 'password123',
      })

      expect(result?.validationErrors?.fieldErrors.email).toContain('Valid email is required')
    })
  })

  describe('Sign Up Flow', () => {
    it('should create account successfully', async () => {
      validateEmail.mockReturnValue({ isValid: true })
      shouldWarnAboutAlternateEmail.mockReturnValue(false)

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: {
          user: { id: 'user-123', email: 'newuser@example.com' },
          session: null,
        },
        error: null,
      })

      const result = await signUpAction({
        email: 'newuser@example.com',
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      })

      expect(result?.serverError).toBeUndefined()
      expect(result?.data).toBeUndefined() // Sign-up doesn't return data, just succeeds
    })

    it('should handle duplicate email registration', async () => {
      validateEmail.mockReturnValue({ isValid: true })
      shouldWarnAboutAlternateEmail.mockReturnValue(false)

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: null },
        error: { message: 'User already registered' },
      })

      const result = await signUpAction({
        email: 'existing@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      })

      expect(result?.serverError).toBe(
        'An Unexpected Error Occurred, please try again. If the problem persists, please contact support.'
      )
    })

    it('should validate email format during signup', async () => {
      validateEmail.mockReturnValue({
        isValid: false,
        error: 'Valid email is required',
      })

      const result = await signUpAction({
        email: 'invalid-email',
        password: 'password123',
        confirmPassword: 'password123',
      })

      expect(result?.validationErrors?.fieldErrors.email).toContain('Valid email is required')
    })

    it('should enforce password requirements', async () => {
      validateEmail.mockReturnValue({ isValid: true })

      const result = await signUpAction({
        email: 'test@example.com',
        password: '123',
        confirmPassword: '123',
      })

      expect(result?.validationErrors?.fieldErrors.password).toBeDefined()
    })

    it('should validate password confirmation matches', async () => {
      validateEmail.mockReturnValue({ isValid: true })

      const result = await signUpAction({
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'differentpassword',
      })

      expect(result?.validationErrors?.fieldErrors.confirmPassword).toContain(
        'Passwords do not match'
      )
    })
  })

  describe('Password Reset Flow', () => {
    it('should send reset email for valid address', async () => {
      validateEmail.mockReturnValue({ isValid: true })

      mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: null,
      })

      const result = await forgotPasswordAction({
        email: 'user@example.com',
      })

      expect(result?.serverError).toBeUndefined()
      expect(result?.data).toBeUndefined() // Password reset doesn't return data, just succeeds
    })

    it('should handle password reset errors gracefully', async () => {
      validateEmail.mockReturnValue({ isValid: true })

      mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
        data: null,
        error: { message: 'Email not found' },
      })

      const result = await forgotPasswordAction({
        email: 'nonexistent@example.com',
      })

      expect(result?.serverError).toBe(
        'An Unexpected Error Occurred, please try again. If the problem persists, please contact support.'
      )
    })

    it('should validate email before sending reset', async () => {
      validateEmail.mockReturnValue({
        isValid: false,
        error: 'Valid email is required',
      })

      const result = await forgotPasswordAction({
        email: 'invalid-email',
      })

      expect(result?.validationErrors?.fieldErrors.email).toContain('Valid email is required')
    })
  })

  describe('OAuth Sign In Flow', () => {
    it('should initiate OAuth sign in with correct provider', async () => {
      mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
        data: { url: 'https://github.com/oauth' },
        error: null,
      })

      await signInWithOAuthAction({
        provider: 'github',
      })

      expect(mockSupabaseClient.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'github',
        options: {
          redirectTo: 'https://localhost:3000/auth/callback',
          scopes: 'email',
        },
      })
    })

    it('should handle OAuth errors', async () => {
      mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
        data: { url: null },
        error: { message: 'OAuth provider error' },
      })

      await signInWithOAuthAction({
        provider: 'github',
      })

      // Since encodedRedirect is not mocked, we check redirect was called
      // with the expected URL containing the error message
      expect(redirect).toHaveBeenCalled()
    })

    it('should support multiple OAuth providers', async () => {
      const providers = ['github', 'google', 'discord'] as const

      for (const provider of providers) {
        mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
          data: { url: `https://${provider}.com/oauth` },
          error: null,
        })

        await signInWithOAuthAction({ provider })

        expect(mockSupabaseClient.auth.signInWithOAuth).toHaveBeenCalledWith({
          provider,
          options: {
            redirectTo: 'https://localhost:3000/auth/callback',
            scopes: 'email',
          },
        })
      }
    })
  })

  describe('Sign Out Flow', () => {
    it('should sign out user and redirect to sign-in', async () => {
      mockSupabaseClient.auth.signOut.mockResolvedValue({
        error: null,
      })

      await signOutAction()

      expect(mockSupabaseClient.auth.signOut).toHaveBeenCalled()
      expect(redirect).toHaveBeenCalledWith('/sign-in')
    })

    it('should redirect even with sign out errors', async () => {
      mockSupabaseClient.auth.signOut.mockResolvedValue({
        error: { message: 'Sign out failed' },
      })

      await signOutAction()

      expect(redirect).toHaveBeenCalledWith('/sign-in')
    })
  })

  describe('Security Validations', () => {
    it('should prevent XSS in returnTo parameter', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      })

      const maliciousPayloads = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'vbscript:msgbox("xss")',
        'file:///etc/passwd',
      ]

      for (const payload of maliciousPayloads) {
        const result = await signInAction({
          email: 'test@example.com',
          password: 'password123',
          returnTo: payload,
        })

        expect(result?.validationErrors?.fieldErrors.returnTo).toBeDefined()
      }
    })

    it('should validate returnTo is within app domain', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      })

      const result = await signInAction({
        email: 'test@example.com',
        password: 'password123',
        returnTo: 'https://evil.com/workspace/steal-data',
      })

      expect(result?.validationErrors?.fieldErrors.returnTo).toBeDefined()
    })

    it('should allow valid relative paths in returnTo', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      })

      const validPaths = ['/workspace/my-project', '/dashboard', '/dashboard/account', '/']

      for (const path of validPaths) {
        await signInAction({
          email: 'test@example.com',
          password: 'password123',
          returnTo: path,
        })

        expect(redirect).toHaveBeenCalledWith(path)
        vi.clearAllMocks()
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockRejectedValue(new Error('Network error'))

      const result = await signInAction({
        email: 'test@example.com',
        password: 'password123',
      })

      expect(result?.serverError).toBe(
        'An Unexpected Error Occurred, please try again. If the problem persists, please contact support.'
      )
    })

    it('should handle unexpected Supabase responses', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: null, // Unexpected: user is null but no error
      })

      await signInAction({
        email: 'test@example.com',
        password: 'password123',
      })

      // Should still redirect to dashboard since no error occurred
      expect(redirect).toHaveBeenCalledWith('/dashboard')
    })
  })
})
