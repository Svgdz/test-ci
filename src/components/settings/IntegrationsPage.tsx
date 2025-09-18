'use client'

import { memo, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/ui/primitives/button'
import { updateProjectSettings, getProjectSettings } from '@/server/projects/project-actions'
import { Tables } from '@/types/database.types'

interface IntegrationsPageProps {
  project?: Tables<'projects'>
}

interface IntegrationSettings {
  githubConnected?: boolean
  databaseConnected?: boolean
  notificationsEnabled?: boolean
}

export const IntegrationsPage = memo(({ project: _project }: IntegrationsPageProps) => {
  const params = useParams()
  const projectId = params?.projectId as string

  const [settings, setSettings] = useState<IntegrationSettings>({
    githubConnected: false,
    databaseConnected: true, // Default to true since we have database
    notificationsEnabled: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Load settings function
  const loadSettings = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getProjectSettings({ projectId })
      if (result.serverError) {
        setError(result.serverError)
        return
      }

      const loadedSettings = (result.data?.settings as IntegrationSettings) || {}
      setSettings({
        githubConnected: loadedSettings.githubConnected || false,
        databaseConnected: loadedSettings.databaseConnected || false,
        notificationsEnabled: loadedSettings.notificationsEnabled || false,
      })
    } catch (err) {
      console.error('Failed to load integration settings:', err)
      setError('Failed to load integration settings')
    } finally {
      setIsLoading(false)
    }
  }

  // Load settings on component mount
  useEffect(() => {
    if (projectId) {
      void loadSettings()
    }
  }, [projectId])

  const handleSave = async () => {
    if (!projectId) return

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await updateProjectSettings({
        projectId,
        githubConnected: settings.githubConnected,
        databaseConnected: settings.databaseConnected,
        notificationsEnabled: settings.notificationsEnabled,
      })

      if (result.serverError) {
        setError(result.serverError)
        return
      }

      setSuccess('Integration settings saved successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Failed to save integration settings:', err)
      setError('Failed to save integration settings')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleIntegration = (key: keyof IntegrationSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (isLoading) {
    return (
      <div className='space-y-6'>
        <div className='animate-pulse'>
          <div className='h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2'></div>
          <div className='h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3'></div>
        </div>
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2'>Integrations</h1>
          <p className='text-gray-600 dark:text-gray-400'>
            Connect your project with external services and tools
          </p>
        </div>
        <Button
          onClick={() => void handleSave()}
          disabled={isSaving}
          className='bg-blue-600 hover:bg-blue-700 text-white'
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4'>
          <p className='text-red-800 dark:text-red-200 text-sm'>{error}</p>
        </div>
      )}

      {success && (
        <div className='bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4'>
          <p className='text-green-800 dark:text-green-200 text-sm'>{success}</p>
        </div>
      )}

      <div className='space-y-4'>
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <div className='w-8 h-8 bg-black dark:bg-white rounded-md flex items-center justify-center'>
                <div className='i-ph:github-logo w-5 h-5 text-white dark:text-black' />
              </div>
              <div>
                <h4 className='font-medium text-gray-900 dark:text-gray-100'>GitHub</h4>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Connect to GitHub repository
                </p>
              </div>
            </div>
            <button
              onClick={() => toggleIntegration('githubConnected')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                settings.githubConnected
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {settings.githubConnected ? 'Connected' : 'Connect'}
            </button>
          </div>
        </div>

        <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <div className='w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center'>
                <div className='i-ph:database w-5 h-5 text-white' />
              </div>
              <div>
                <h4 className='font-medium text-gray-900 dark:text-gray-100'>Database</h4>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  Configure database connection
                </p>
              </div>
            </div>
            <button
              onClick={() => toggleIntegration('databaseConnected')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                settings.databaseConnected
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {settings.databaseConnected ? 'Connected' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})

IntegrationsPage.displayName = 'IntegrationsPage'
