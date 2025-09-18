'use client'

import { memo, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Input } from '@/ui/primitives/input'
import { Textarea } from '@/ui/primitives/textarea'
import { Label } from '@/ui/primitives/label'
import { Select } from '@/ui/primitives/select'
import { Button } from '@/ui/primitives/button'
import { updateProject } from '@/server/projects/project-actions'
import { Tables } from '@/types/database.types'

interface OverviewPageProps {
  project?: Tables<'projects'>
}

export const OverviewPage = memo(({ project: initialProject }: OverviewPageProps) => {
  const params = useParams()
  const projectId = params?.projectId as string

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [project, setProject] = useState<Tables<'projects'> | null>(initialProject || null)
  const [projectName, setProjectName] = useState(initialProject?.name || '')
  const [description, setDescription] = useState(initialProject?.description || '')
  const [isPublic, setIsPublic] = useState(initialProject?.visibility === 'public')
  const [hideAibexx, setHideAibexx] = useState(initialProject?.watermark === false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Load project function using API route
  const loadProject = async () => {
    if (!projectId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'GET',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`Failed to load project: ${response.status}`)
      }

      const data = (await response.json()) as { project?: Tables<'projects'>; error?: string }

      if (data.error) {
        throw new Error(data.error)
      }

      if (!data.project) {
        throw new Error('Project not found')
      }

      const projectData = data.project
      setProject(projectData)
      setProjectName(projectData.name || '')
      setDescription(projectData.description || '')
      setIsPublic(projectData.visibility === 'public')
      setHideAibexx(false) // Default value since watermark is not in the database
    } catch (err) {
      console.error('Failed to load project data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load project data')
    } finally {
      setIsLoading(false)
    }
  }

  // Load project data if not provided
  useEffect(() => {
    if (!initialProject && projectId) {
      void loadProject()
    }
  }, [projectId, initialProject])

  const handleSave = async () => {
    if (!projectId) return

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await updateProject({
        projectId,
        name: projectName,
        description: description,
        visibility: isPublic ? 'public' : 'private',
        watermark: !hideAibexx,
      })

      if (result.serverError) {
        setError(result.serverError)
        return
      }

      if (result.data?.project) {
        setProject(result.data.project as Tables<'projects'>)
        setSuccess('Project settings saved successfully')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      console.error('Failed to save project settings:', err)
      setError('Failed to save project settings')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className='space-y-8'>
        <div className='animate-pulse'>
          <div className='h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-6'></div>
          <div className='space-y-4'>
            <div className='h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4'></div>
            <div className='h-12 bg-gray-200 dark:bg-gray-700 rounded'></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='space-y-8'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>Project Overview</h1>
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

      {/* Project Name Section */}
      <div className='space-y-3'>
        <Label className='text-base font-semibold text-gray-900 dark:text-gray-100'>
          Project Name
        </Label>
        <Input
          type='text'
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className='h-12 text-lg font-medium'
          placeholder='Enter project name'
        />
      </div>

      {/* Description Section */}
      <div className='space-y-3'>
        <Label className='text-base font-semibold text-gray-900 dark:text-gray-100'>
          Description
        </Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          className='min-h-[120px] text-base leading-relaxed font-medium'
          placeholder='Enter project description'
        />
      </div>

      {/* Hide Aibexx Badge Section */}
      <div className='space-y-2'>
        <div className='flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700'>
          <div>
            <h3 className='text-base font-semibold text-gray-900 dark:text-gray-100'>
              Hide "Aibexx" Badge
              <span className='ml-2 text-sm text-blue-500 hover:text-blue-400 cursor-pointer'>
                <div className='i-ph:info inline-block w-4 h-4' />
                Upgrade
              </span>
            </h3>
            <p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>
              Upgrade your plan to remove the "Made with Aibexx" badge from your app.
            </p>
          </div>
          <label className='relative inline-flex items-center cursor-pointer'>
            <input
              type='checkbox'
              className='sr-only peer'
              checked={hideAibexx}
              onChange={(e) => setHideAibexx(e.target.checked)}
            />
            <div className='w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[""] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600'></div>
          </label>
        </div>
      </div>

      {/* Project Visibility Section */}
      <div className='space-y-2'>
        <div className='flex items-center justify-between py-4'>
          <div>
            <h3 className='text-base font-semibold text-gray-900 dark:text-gray-100'>
              Project Visibility
              <span className='ml-2 text-sm text-blue-500 hover:text-blue-400 cursor-pointer'>
                <div className='i-ph:info inline-block w-4 h-4' />
                Upgrade
              </span>
            </h3>
            <p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>
              Anyone can view and remix this project
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <div className='i-ph:globe w-4 h-4 text-gray-500' />
            <Select
              value={isPublic ? 'public' : 'private'}
              onChange={(e) => setIsPublic(e.target.value === 'public')}
              className='min-w-[120px]'
            >
              <option value='public'>Public</option>
              <option value='private'>Private</option>
            </Select>
            <div className='i-ph:caret-down w-4 h-4 text-gray-500' />
          </div>
        </div>
      </div>
    </div>
  )
})

OverviewPage.displayName = 'OverviewPage'
