'use client'

import { memo, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/ui/primitives/button'
import { Textarea } from '@/ui/primitives/textarea'
import { updateProjectSettings, getProjectSettings } from '@/server/projects/project-actions'
import { Tables } from '@/types/database.types'

interface SecurityPageProps {
  project?: Tables<'projects'>
}

interface SecuritySettings {
  enableHttps?: boolean
  enableCors?: boolean
  allowedOrigins?: string
}

export const SecurityPage = memo(({ project: _project }: SecurityPageProps) => {
  const params = useParams()
  const projectId = params?.projectId as string

  const [settings, setSettings] = useState<SecuritySettings>({
    enableHttps: true,
    enableCors: false,
    allowedOrigins: '',
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

      const loadedSettings = (result.data?.settings as SecuritySettings) || {}
      setSettings({
        enableHttps: loadedSettings.enableHttps ?? true,
        enableCors: loadedSettings.enableCors ?? false,
        allowedOrigins: loadedSettings.allowedOrigins || '*',
      })
    } catch (err) {
      console.error('Failed to load security settings:', err)
      setError('Failed to load security settings')
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
        enableHttps: settings.enableHttps,
        enableCors: settings.enableCors,
        allowedOrigins: settings.allowedOrigins,
      })

      if (result.serverError) {
        setError(result.serverError)
        return
      }

      setSuccess('Security settings saved successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Failed to save security settings:', err)
      setError('Failed to save security settings')
    } finally {
      setIsSaving(false)
    }
  }

  const updateSetting = (key: keyof SecuritySettings, value: boolean | string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
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
          <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2'>
            Security Settings
          </h1>
          <p className='text-gray-600 dark:text-gray-400'>
            Configure security and access controls for your project
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
        <div className='flex items-center justify-between'>
          <div>
            <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
              Enable HTTPS
            </label>
            <p className='text-xs text-gray-500 dark:text-gray-400'>
              Force HTTPS for all connections
            </p>
          </div>
          <label className='relative inline-flex items-center cursor-pointer'>
            <input
              type='checkbox'
              className='sr-only peer'
              checked={settings.enableHttps}
              onChange={(e) => updateSetting('enableHttps', e.target.checked)}
            />
            <div className='w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[""] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600'></div>
          </label>
        </div>

        <div className='flex items-center justify-between'>
          <div>
            <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
              Enable CORS
            </label>
            <p className='text-xs text-gray-500 dark:text-gray-400'>Allow cross-origin requests</p>
          </div>
          <label className='relative inline-flex items-center cursor-pointer'>
            <input
              type='checkbox'
              className='sr-only peer'
              checked={settings.enableCors}
              onChange={(e) => updateSetting('enableCors', e.target.checked)}
            />
            <div className='w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[""] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600'></div>
          </label>
        </div>

        <div>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            Allowed Origins
          </label>
          <Textarea
            value={settings.allowedOrigins}
            onChange={(e) => updateSetting('allowedOrigins', e.target.value)}
            rows={3}
            placeholder='https://example.com&#10;https://app.example.com'
            className='w-full'
          />
        </div>
      </div>
    </div>
  )
})

SecurityPage.displayName = 'SecurityPage'
