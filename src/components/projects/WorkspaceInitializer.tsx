'use client'

import { useEffect, useState } from 'react'
import { WorkspaceProvider } from '@/components/workspace/context/WorkspaceProvider'
import { WorkspaceV3 } from '@/components/workspace/layout/WorkspaceV3'
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react'

interface WorkspaceInitializerProps {
  projectId: string
  initialPrompt?: string
  project: {
    id: string
    name: string
    sandbox_id: string | null
    sandbox_status: string | null
    description: string | null
    default_domain?: string | null
  }
}

interface InitializationState {
  status: 'initializing' | 'success' | 'error' | 'ready'
  message: string
  sandboxId?: string
  sandboxUrl?: string
  error?: string
  justInitialized?: boolean
}

export function WorkspaceInitializer({
  projectId,
  initialPrompt,
  project,
}: WorkspaceInitializerProps) {
  const [initState, setInitState] = useState<InitializationState>(() => {
    // If project already has sandbox and is active, it's ready
    if (project.sandbox_id && project.sandbox_status === 'active') {
      return {
        status: 'ready',
        message: 'Workspace ready',
        sandboxId: project.sandbox_id,
        sandboxUrl: project.default_domain || undefined,
        justInitialized: true, // Set to true for existing projects to trigger auto-refresh
      }
    }

    // Otherwise, needs initialization (sandbox_status is null or not active)
    return {
      status: 'initializing',
      message: 'Setting up your workspace...',
    }
  })

  // Track if initialization is in progress to prevent multiple calls
  const [isInitializing, setIsInitializing] = useState(false)

  // Clear justInitialized flag for existing projects after a delay
  useEffect(() => {
    if (initState.status === 'ready' && initState.justInitialized && project.sandbox_id) {
      console.log('[WorkspaceInitializer] Existing project loaded, will clear justInitialized flag')
      const timer = setTimeout(() => {
        setInitState((prev) => ({
          ...prev,
          justInitialized: false,
        }))
        console.log('[WorkspaceInitializer] Cleared justInitialized flag for existing project')
      }, 3000) // Give enough time for auto-refresh to trigger

      return () => clearTimeout(timer)
    }
  }, [initState.status, initState.justInitialized, project.sandbox_id])

  useEffect(() => {
    // Skip initialization if already ready or already in progress
    if (initState.status === 'ready' || isInitializing) {
      return
    }

    const initializeWorkspace = async () => {
      // Prevent multiple simultaneous calls
      if (isInitializing) {
        console.log('[WorkspaceInitializer] Initialization already in progress, skipping')
        return
      }

      setIsInitializing(true)
      console.log(
        '[WorkspaceInitializer] Starting workspace initialization for project:',
        projectId
      )
      try {
        setInitState({
          status: 'initializing',
          message: 'Creating sandbox environment...',
        })

        const response = await fetch('/api/workspace/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        })

        const data = await response.json()

        if (!response.ok || data.error) {
          throw new Error(data.error || 'Failed to initialize workspace')
        }

        if (data.alreadyInitialized) {
          setInitState({
            status: 'ready',
            message: 'Workspace ready',
            sandboxId: data.sandboxId,
            sandboxUrl: data.sandboxUrl,
          })
        } else {
          // Show success message briefly before transitioning to ready
          setInitState({
            status: 'success',
            message: 'Workspace initialized successfully!',
            sandboxId: data.sandboxId,
            sandboxUrl: data.sandboxUrl,
          })

          // Transition to ready after a brief delay
          setTimeout(() => {
            setInitState((prev) => ({
              ...prev,
              status: 'ready',
              message: 'Workspace ready',
              justInitialized: true, // Flag to trigger auto-actions
            }))

            // Clear the justInitialized flag after a delay to prevent repeated triggers
            setTimeout(() => {
              setInitState((prev) => ({
                ...prev,
                justInitialized: false,
              }))
            }, 5000) // Clear after 5 seconds
          }, 1500)
        }
      } catch (error) {
        console.error('Failed to initialize workspace:', error)
        setInitState({
          status: 'error',
          message: 'Failed to initialize workspace',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        setIsInitializing(false)
      }
    }

    initializeWorkspace()
  }, [projectId, initState.status, isInitializing])

  // Always render the workspace, pass initialization state to it
  // The workspace components will handle showing loading states in appropriate areas

  // Always render the workspace, but pass initialization state
  // Use the actual sandbox ID when available, placeholder during initialization
  const workspaceSandboxId = initState.sandboxId || project.sandbox_id || 'initializing'

  return (
    <WorkspaceProvider sandboxId={workspaceSandboxId} projectId={project.id}>
      <div className='bg-white h-screen flex flex-col'>
        <div className='flex-1'>
          <WorkspaceV3
            sandboxKey={project.id}
            sandboxId={workspaceSandboxId}
            initialPrompt={initialPrompt}
            initializationState={initState}
            projectName={project.name}
          />
        </div>
      </div>
    </WorkspaceProvider>
  )
}
