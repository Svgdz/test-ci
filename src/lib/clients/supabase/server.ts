import 'server-cli-only'

import { Database } from '@/types/database.types'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRequiredEnvVars } from '@/lib/utils/env-check'

export const createClient = async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const envCheck = checkRequiredEnvVars()
    if (!envCheck.isValid) {
      console.error(`Missing required environment variables: ${envCheck.missing.join(', ')}`)
      throw new Error('Supabase environment variables not configured')
    }
    throw new Error('Missing required environment variables for Supabase server client')
  }

  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // The `set` method was called from a Server Component.
            // This can be ignored since we have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
