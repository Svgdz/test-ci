import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { serializeError } from 'serialize-error'
import { l } from './lib/clients/logger'
import { getUserSession, handleAuthentication } from './server/middleware'

export async function middleware(request: NextRequest) {
  try {
    // Setup response and Supabase client
    const response = NextResponse.next({
      request,
    })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const result = (await getUserSession(supabase)) as {
      error: unknown
      data: { user: unknown } | null
    }
    const isAuthenticated = !result.error && !!result.data?.user

    // Handle authentication redirects - this covers all auth logic needed
    const authRedirect = handleAuthentication(request, isAuthenticated)
    if (authRedirect) return authRedirect

    // Continue with the request for authenticated users or public routes
    return response
  } catch (error) {
    l.error({
      key: 'middleware:unexpected_error',
      error: serializeError(error),
    })
    // Return a basic response to avoid infinite loops
    return NextResponse.next({
      request,
    })
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - api routes
     * - vercel analytics route
     * - posthog routes
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|_vercel/|ingest/).*)',
  ],
}
