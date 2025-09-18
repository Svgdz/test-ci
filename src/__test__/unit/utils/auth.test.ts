import { describe, it, expect, beforeEach, vi } from 'vitest'
import { encodedRedirect } from '@/lib/utils/auth'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT: ${url}`)
  }),
}))

describe('Auth Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('encodedRedirect', () => {
    it('should redirect with encoded message in URL', () => {
      expect(() => {
        encodedRedirect('error', '/sign-in', 'Invalid credentials')
      }).toThrow(/NEXT_REDIRECT:.*\/sign-in.*error=/)
    })

    it('should handle different message types', () => {
      const messageTypes = ['error', 'success', 'warning', 'info'] as const

      messageTypes.forEach((type) => {
        expect(() => {
          encodedRedirect(type, '/test', `Test ${type} message`)
        }).toThrow(/NEXT_REDIRECT:.*\/test/)
      })
    })

    it('should handle additional parameters', () => {
      expect(() => {
        encodedRedirect('error', '/sign-in', 'Error message', { returnTo: '/dashboard' })
      }).toThrow(/NEXT_REDIRECT:.*returnTo=/)
    })

    it('should handle empty messages', () => {
      expect(() => {
        encodedRedirect('error', '/sign-in', '')
      }).toThrow(/NEXT_REDIRECT:.*\/sign-in/)
    })

    it('should handle URLs with existing query parameters', () => {
      expect(() => {
        encodedRedirect('error', '/sign-in?existing=param', 'Error message')
      }).toThrow(/NEXT_REDIRECT:.*existing=param/)
    })
  })
})
