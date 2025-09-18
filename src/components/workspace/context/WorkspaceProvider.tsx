'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { FileMap } from '@/lib/stores/files'
import { l } from '@/lib/clients/logger'
import { storeFactory } from '@/lib/stores/store-factory'

interface WorkspaceContextValue {
  // Core state
  sandboxId: string
  projectId: string
  currentView: 'code' | 'preview' | 'settings'
  selectedFile: string | null

  // Complete file map loaded via direct API call
  fileMap: FileMap

  // Preview data
  previewUrl: string | null

  // Loading states
  isLoadingProject: boolean

  // UI state
  setCurrentView: (view: 'code' | 'preview' | 'settings') => void
  setSelectedFile: (filePath: string | null) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

interface WorkspaceProviderProps {
  children: ReactNode
  sandboxId: string
  projectId: string
  initialView?: 'code' | 'preview' | 'settings'
}

/**
 * Simple workspace provider that replaces complex store factory
 * Uses server actions + SWR instead of client-side stores
 */
export function WorkspaceProvider({
  children,
  sandboxId,
  projectId,
  initialView = 'code',
}: WorkspaceProviderProps) {
  const [currentView, setCurrentView] = useState<'code' | 'preview' | 'settings'>(initialView)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoadingProject, setIsLoadingProject] = useState(true)
  const [fileMap, setFileMap] = useState<FileMap>({})

  // Load project files and preview on mount
  useEffect(() => {
    const initializeProject = async () => {
      try {
        l.info({
          key: 'workspace_provider:loading_project',
          projectId,
          sandboxId,
        })

        // Use direct API call to /api/sandbox/files (same as WorkspaceV3)
        const response = await fetch(`/api/sandbox/files?sandboxId=${sandboxId}`)
        const result = (await response.json()) as {
          success?: boolean
          files?: Record<string, string>
          serverError?: string
        }

        if (!result.success) {
          l.error({
            key: 'workspace_provider:load_error',
            error: result.serverError,
            projectId,
            sandboxId,
          })
        } else {
          const { files } = result

          // Construct preview URL (same logic as removed loadProjectFiles)
          const constructedPreviewUrl = `https://5173-${sandboxId}.e2b.dev`
          setPreviewUrl(constructedPreviewUrl)

          // Build a FileMap compatible with FileTree from simple files object
          const map: FileMap = {}
          for (const [path, content] of Object.entries(files || {})) {
            if (!path || path === '/' || path === '/home' || path === '/home/user') continue
            map[path] = { type: 'file', content: String(content), isBinary: false }
          }
          setFileMap(map)

          // Push files into legacy FilesStore for editor/file tree consumption
          try {
            const stores = storeFactory.createStoreSet(projectId)
            stores.filesStore.setFiles(map)
          } catch (err) {
            l.warn(
              { key: 'workspace_provider:store_sync_failed', err },
              'Failed to sync files to legacy store'
            )
          }

          // Switch to preview if available
          if (constructedPreviewUrl && initialView === 'code') {
            setCurrentView('preview')
          }

          l.info({
            key: 'workspace_provider:project_loaded',
            projectId,
            sandboxId,
            hasPreview: !!constructedPreviewUrl,
            fileCount: Object.keys(files || {}).length,
          })
        }
      } catch (error) {
        l.error({
          key: 'workspace_provider:init_error',
          error,
          projectId,
          sandboxId,
        })
      } finally {
        setIsLoadingProject(false)
      }
    }

    void initializeProject()
  }, [projectId, sandboxId, initialView])

  const contextValue: WorkspaceContextValue = {
    sandboxId,
    projectId,
    currentView,
    selectedFile,
    fileMap,
    previewUrl,
    isLoadingProject,
    setCurrentView,
    setSelectedFile,
  }

  return <WorkspaceContext.Provider value={contextValue}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return context
}
