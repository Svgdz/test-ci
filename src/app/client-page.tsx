'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/ui/primitives/button'
import { toast } from 'react-toastify'
import { AUTH_URLS } from '@/configs/urls'
import Link from 'next/link'

interface Project {
  id: string
  name: string
  default_domain?: string | null
}

interface ClientHomePageProps {
  initialPrompt: string
  isAuthenticated: boolean
  initialProjects?: Project[]
}

const DEFAULT_TEMPLATE = 'react-vite'
const TOAST_POSITION = 'top-right' as const

export function ClientHomePage({
  initialPrompt,
  isAuthenticated,
  initialProjects = [],
}: ClientHomePageProps) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>(initialProjects)

  /*
   * Load user projects when authenticated
   * Refreshes project list on authentication state change
   */
  useEffect(() => {
    if (!isAuthenticated) return

    const loadProjects = async () => {
      try {
        const res = await fetch('/api/projects', { cache: 'no-store', credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as {
          projects?: Project[]
        }
        setProjects(data.projects || [])
      } catch {
        /* Silently ignore project loading errors */
      }
    }

    void loadProjects()
  }, [isAuthenticated])

  /*
   * Handle form submission for project creation
   * Creates new project if authenticated, otherwise redirects to sign-in
   */
  const handleSubmit = async (formData: FormData) => {
    const promptValue = formData.get('prompt') as string

    if (!promptValue?.trim()) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      if (isAuthenticated) {
        const dismiss = toast.loading('Creating project...', { position: TOAST_POSITION })
        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptValue.trim(),
            template: DEFAULT_TEMPLATE,
          }),
        })

        const data = (await response.json()) as {
          type?: string
          projectId?: string
          initialPrompt?: string
          error?: string
        }

        if (!response.ok || data.error) {
          const errorMessage = data.error || 'Failed to start project'
          toast.update(dismiss, {
            render: errorMessage,
            type: 'error',
            isLoading: false,
            autoClose: 3000,
          })
          setError(`${errorMessage}. Please try again.`)
          setIsLoading(false)
          return
        }

        if (data.type === 'redirect' && data.projectId) {
          toast.update(dismiss, {
            render: 'Project ready',
            type: 'success',
            isLoading: false,
            autoClose: 1000,
          })
          // Pass the initial prompt as URL parameter to the workspace
          const params = new URLSearchParams()
          if (data.initialPrompt) {
            params.set('prompt', data.initialPrompt)
          }
          const queryString = params.toString()
          const url = `/workspace/${data.projectId}${queryString ? `?${queryString}` : ''}`
          router.push(url)
          return
        }

        const unexpectedError = 'Unexpected response'
        toast.update(dismiss, {
          render: unexpectedError,
          type: 'error',
          isLoading: false,
          autoClose: 3000,
        })
        setError(`${unexpectedError}. Please try again.`)
        setIsLoading(false)
      } else {
        // User is not signed in - redirect to signin with return URL
        const encodedPrompt = encodeURIComponent(promptValue.trim())
        router.push(
          `${AUTH_URLS.SIGN_IN}?returnTo=${encodeURIComponent(`/?prompt=${encodedPrompt}`)}`
        )
      }
    } catch {
      // Handle network or unexpected errors
      const genericError = 'Something went wrong'
      setError(`${genericError}. Please try again.`)
      setIsLoading(false)
    }
  }

  /*
   * Handle keyboard shortcuts in textarea
   * Enter submits form, Shift+Enter adds new line
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const form = e.currentTarget.form
      if (form) {
        const formData = new FormData(form)
        void handleSubmit(formData)
      }
    }
  }

  return (
    <div className='bg-gradient-to-br from-white via-gray-50 to-white px-4'>
      {/* Above-the-fold: hero + prompt occupies full viewport height */}
      <section className='min-h-[calc(100vh-4rem)] flex items-center'>
        <div className='max-w-5xl w-full mx-auto'>
          {/* Main hero section with title and description */}
          <div className='text-center mb-12'>
            <h1 className='text-2xl md:text-6xl font-bold text-gray-900 mb-6'>
              what are we building
              <span className='text-gray-900'>?</span>
            </h1>

            <p className='text-xl text-gray-600 mb-12 max-w-2xl mx-auto'>
              Ask me to help you build anything.
            </p>
          </div>

          {/* Main prompt input form */}
          <div className='max-w-2xl mx-auto'>
            {/* Error message display */}
            {error && (
              <div className='mb-4 p-4 bg-red-50 border border-red-200 rounded-lg'>
                <p className='text-red-800 text-sm'>{error}</p>
              </div>
            )}
            <form action={handleSubmit} className='relative'>
              <div className='relative'>
                <textarea
                  name='prompt'
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder='Enter your prompt here...'
                  className='w-full min-h-[120px] p-6 pr-16 text-lg border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none shadow-lg transition-all duration-200 placeholder-gray-400'
                  disabled={isLoading}
                  rows={4}
                />

                <Button
                  type='submit'
                  disabled={!prompt.trim() || isLoading}
                  className='absolute bottom-4 right-4 rounded-xl px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 transition-all duration-200'
                >
                  {isLoading ? (
                    <div className='flex items-center'>
                      <svg
                        className='animate-spin -ml-1 mr-2 h-4 w-4'
                        fill='none'
                        viewBox='0 0 24 24'
                      >
                        <circle
                          className='opacity-25'
                          cx='12'
                          cy='12'
                          r='10'
                          stroke='currentColor'
                          strokeWidth='4'
                        />
                        <path
                          className='opacity-75'
                          fill='currentColor'
                          d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                        />
                      </svg>
                      {isAuthenticated ? 'Creating project...' : 'Loading...'}
                    </div>
                  ) : (
                    <div className='flex items-center'>
                      <span>Get Started</span>
                      <svg
                        className='ml-2 w-4 h-4'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M13 7l5 5m0 0l-5 5m5-5H6'
                        />
                      </svg>
                    </div>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Projects section - only visible when authenticated */}
      {isAuthenticated && (
        <section className='py-16 border-t border-gray-100'>
          <div className='max-w-5xl w-full mx-auto'>
            <div className='flex items-center justify-between mb-6'>
              <h2 className='text-xl font-semibold text-gray-900'>
                Your Projects ({projects.length})
              </h2>
              <Link href='/workspace' className='text-sm text-indigo-600 hover:text-indigo-700'>
                View all
              </Link>
            </div>

            {/* Project grid or empty state */}
            {projects.length === 0 ? (
              <div className='text-gray-500 text-sm'>No projects yet.</div>
            ) : (
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'>
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className='group border rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow'
                  >
                    <div className='aspect-video bg-gray-100 rounded-t-xl flex items-center justify-center text-gray-400 text-sm'>
                      No preview
                    </div>
                    <div className='p-4'>
                      <div className='font-medium text-gray-900 truncate'>{p.name}</div>
                      {p.default_domain && (
                        <div className='text-xs text-gray-500 truncate mt-1'>
                          {p.default_domain}
                        </div>
                      )}
                      <div className='mt-3'>
                        <Link
                          href={`/workspace/${p.id}`}
                          className='text-indigo-600 text-sm hover:text-indigo-700'
                        >
                          Open workspace →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
