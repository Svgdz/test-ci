'use client'

import { memo, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Input } from '@/ui/primitives/input'
import { Button } from '@/ui/primitives/button'
import { updateProjectSettings } from '@/server/projects/project-actions'
import { Tables } from '@/types/database.types'

interface DeploymentPageProps {
  project?: Tables<'projects'>
}

interface DeploymentSettings {
  buildCommand?: string
  outputDirectory?: string
  autoDeploy?: boolean
}

export const DeploymentPage = memo(({ project: _project }: DeploymentPageProps) => {
  const params = useParams()
  const projectId = params?.projectId as string

  const [settings, setSettings] = useState<DeploymentSettings>({
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    autoDeploy: false,
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
      const response = await fetch(`/api/projects/${projectId}/settings/deployment`)
      if (!response.ok) throw new Error('Failed to load settings')

      const data = (await response.json()) as {
        buildCommand?: string
        outputDirectory?: string
        autoDeploy?: boolean
      }

      setSettings({
        buildCommand: data.buildCommand || 'npm run build',
        outputDirectory: data.outputDirectory || 'dist',
        autoDeploy: data.autoDeploy || false,
      })
    } catch (err) {
      console.error('Failed to load deployment settings:', err)
      setError('Failed to load deployment settings')
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
        buildCommand: settings.buildCommand,
        outputDirectory: settings.outputDirectory,
        autoDeploy: settings.autoDeploy,
      })

      if (result.serverError) {
        setError(result.serverError)
        return
      }

      setSuccess('Deployment settings saved successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Failed to save deployment settings:', err)
      setError('Failed to save deployment settings')
    } finally {
      setIsSaving(false)
    }
  }

  const updateSetting = (key: keyof DeploymentSettings, value: string | boolean) => {
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
            Deployment Settings
          </h1>
          <p className='text-gray-600 dark:text-gray-400'>
            Configure how your project is built and deployed
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
        <div>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            Build Command
          </label>
          <Input
            type='text'
            value={settings.buildCommand}
            onChange={(e) => updateSetting('buildCommand', e.target.value)}
            placeholder='npm run build'
            className='w-full'
          />
        </div>

        <div>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            Output Directory
          </label>
          <Input
            type='text'
            value={settings.outputDirectory}
            onChange={(e) => updateSetting('outputDirectory', e.target.value)}
            placeholder='dist'
            className='w-full'
          />
        </div>

        <div className='flex items-center justify-between'>
          <div>
            <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
              Auto Deploy
            </label>
            <p className='text-xs text-gray-500 dark:text-gray-400'>
              Deploy automatically on push to main
            </p>
          </div>
          <label className='relative inline-flex items-center cursor-pointer'>
            <input
              type='checkbox'
              className='sr-only peer'
              checked={settings.autoDeploy}
              onChange={(e) => updateSetting('autoDeploy', e.target.checked)}
            />
            <div className='w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[""] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600'></div>
          </label>
        </div>
      </div>
    </div>
  )
})

DeploymentPage.displayName = 'DeploymentPage'
