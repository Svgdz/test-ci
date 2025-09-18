import { AUTH_URLS, PROTECTED_URLS } from '@/configs/urls'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient, AuthError, User } from '@supabase/supabase-js'

// URL utility functions
export function isAuthRoute(pathname: string): boolean {
  return (
    pathname.includes(AUTH_URLS.SIGN_IN) ||
    pathname.includes(AUTH_URLS.SIGN_UP) ||
    pathname.includes(AUTH_URLS.FORGOT_PASSWORD)
  )
}

export function isProtectedRoute(pathname: string): boolean {
  return (
    pathname.startsWith(PROTECTED_URLS.WORKSPACE) || pathname.startsWith(PROTECTED_URLS.DASHBOARD)
  )
}

export function buildRedirectUrl(path: string, request: NextRequest): URL {
  return new URL(path, request.url)
}

// Authentication utility functions
export async function getUserSession(
  supabase: SupabaseClient
): Promise<{ data: { user: User | null }; error: AuthError | null }> {
  const result = await supabase.auth.getUser()
  return result
}

export function handleAuthentication(
  request: NextRequest,
  isAuthenticated: boolean
): NextResponse | null {
  if (isProtectedRoute(request.nextUrl.pathname) && !isAuthenticated) {
    return NextResponse.redirect(buildRedirectUrl(AUTH_URLS.SIGN_IN, request))
  }

  if (isAuthRoute(request.nextUrl.pathname) && isAuthenticated) {
    return NextResponse.redirect(buildRedirectUrl('/', request))
  }

  return null
}
