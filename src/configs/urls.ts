// Authentication URLs
export const AUTH_URLS = {
  SIGN_IN: '/sign-in',
  SIGN_UP: '/sign-up',
  FORGOT_PASSWORD: '/auth/forgot-password',
  CALLBACK: '/auth/callback',
} as const

// Protected URLs - require authentication
export const PROTECTED_URLS = {
  WORKSPACE: '/workspace',
  DASHBOARD: '/dashboard', // TODO: remove this. we just used for testing middleware.
  ACCOUNT_SETTINGS: '/dashboard/account',
  RESET_PASSWORD: '/auth/reset-password',
} as const

// Public URLs - accessible without authentication
export const PUBLIC_URLS = {
  HOME: '/',
  LANDING: '/',
} as const
