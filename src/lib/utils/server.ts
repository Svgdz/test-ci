import 'server-cli-only'

import { createClient } from '@/lib/clients/supabase/server'
import { UnauthenticatedError } from '@/types/errors'

/*
 *  This function checks if the user is authenticated and returns the user and the supabase client.
 *  If the user is not authenticated, it throws an error.
 *
 *  @params request - an optional NextRequest object to create a supabase client for route handlers
 */
export async function checkAuthenticated() {
  const supabase = await createClient()

  // retrieve session from storage medium (cookies)
  // if no stored session found, not authenticated
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw UnauthenticatedError()
  }

  // now retrieve user from supabase to use further
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw UnauthenticatedError()
  }

  return { user, session, supabase }
}

/**
 * Sanitize untrusted text input for storage and logs.
 * - trims whitespace
 * - strips control characters (except tab/newline)
 * - caps maximum length
 */
export function sanitizeText(input: string, maxLength: number = 4000): string {
  let out = ''
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    if ((code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13) {
      out += input[i]
    }
  }
  out = out.trim()
  return out.length > maxLength ? out.slice(0, maxLength) : out
}
