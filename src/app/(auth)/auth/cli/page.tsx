import { AUTH_URLS, PROTECTED_URLS } from '@/configs/urls'
import { l } from '@/lib/clients/logger'
import { createClient } from '@/lib/clients/supabase/server'
import { encodedRedirect } from '@/lib/utils/auth'
import { getDefaultTeamRelation } from '@/server/auth/get-default-team'
import { Alert, AlertDescription, AlertTitle } from '@/ui/primitives/alert'
import { CloudIcon, LaptopIcon, Link2Icon } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { serializeError } from 'serialize-error'

// Mark route as dynamic to prevent static optimization
export const dynamic = 'force-dynamic'

// Types
type CLISearchParams = Promise<{
  next?: string
  state?: string
  error?: string
}>

// Server Actions

async function handleCLIAuth(
  next: string,
  userId: string,
  userEmail: string,
  _supabaseAccessToken: string
) {
  if (!next?.startsWith('http://localhost')) {
    throw new Error('Invalid redirect URL')
  }

  try {
    const defaultTeam = await getDefaultTeamRelation(userId)

    const searchParams = new URLSearchParams({
      email: userEmail,
      accessToken: 'mock-access-token', // TODO: Implement real E2B token generation
      defaultTeamId: String(defaultTeam.team_id),
    })

    return redirect(`${next}?${searchParams.toString()}`)
  } catch (err: unknown) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
}

// UI Components
function CLIIcons() {
  return (
    <p className='flex items-center justify-center gap-4 text-3xl  tracking-tight sm:text-4xl'>
      <span className='text-fg-tertiary'>
        <LaptopIcon size={50} />
      </span>
      <span className='text-fg-secondary'>
        <Link2Icon size={30} />
      </span>
      <span className='text-fg-tertiary'>
        <CloudIcon size={50} />
      </span>
    </p>
  )
}

function ErrorAlert({ message }: { message: string }) {
  // "border" prop is not valid for Alert, so using only className for border styling
  return (
    <Alert variant='destructive' className='text-start border-b'>
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

function SuccessState() {
  return (
    <>
      <h2 className='text-brand-400 '>Successfully linked</h2>
      <div>You can close this page and start using CLI.</div>
    </>
  )
}

// Main Component
export default async function CLIAuthPage({ searchParams }: { searchParams: CLISearchParams }) {
  const { next, state, error } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (state === 'success') {
    return <SuccessState />
  }

  // Validate redirect URL
  if (!next?.startsWith('http://localhost')) {
    l.error({
      key: 'cli_auth:invalid_redirect_url',
      user_id: user?.id,
      context: {
        next,
      },
    })
    redirect(PROTECTED_URLS.DASHBOARD)
  }

  // If user is not authenticated, redirect to sign in with return URL
  if (!user) {
    // Use a constant for the CLI auth path to avoid property errors
    const CLI_AUTH_PATH = '/auth/cli'
    const searchParamsForReturn = new URLSearchParams({ next })
    const authSearchParams = new URLSearchParams({
      returnTo: `${CLI_AUTH_PATH}?${searchParamsForReturn.toString()}`,
    })
    redirect(`${AUTH_URLS.SIGN_IN}?${authSearchParams.toString()}`)
  }

  // Handle CLI callback if authenticated
  if (!error && next && user) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error('No provider access token found')
      }

      return await handleCLIAuth(next, user.id, user.email!, session.access_token)
    } catch (err) {
      if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
        throw err
      }

      l.error({
        key: 'cli_auth:unexpected_error',
        error: serializeError(err),
        user_id: user?.id,
        context: {
          next,
        },
      })

      return encodedRedirect('error', '/auth/cli', (err as Error).message, {
        next,
      })
    }
  }

  return (
    <div className='p-6 text-center'>
      <CLIIcons />
      <h2 className='mt-6 text-base leading-7'>Linking CLI with your account</h2>
      <div className='text-fg-tertiary mt-12 leading-8'>
        <Suspense fallback={<div>Loading...</div>}>
          {error ? (
            <ErrorAlert message={decodeURIComponent(error)} />
          ) : (
            <div>Authorizing CLI...</div>
          )}
        </Suspense>
      </div>
    </div>
  )
}
