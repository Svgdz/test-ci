'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { l } from '@/lib/clients/logger'
import { FileBreadcrumb } from '../tree/FileBreadcrumb'
import type { FileMap, File, Folder } from '@/lib/stores/files'
import {
  CodeMirrorEditor,
  type EditorDocument,
} from '@/components/editor/codemirror/CodeMirrorEditor'
import CodeApplicationProgress, {
  type CodeApplicationState,
} from '@/components/CodeApplicationProgress'
import { WorkspaceSettingsPanel } from '@/components/workspace/settings/WorkspaceSettingsModal'
import { ChevronRight, File as FileIcon, Folder as FolderIcon } from 'lucide-react'
import { analyzeEditIntent } from '@/lib/utils/intent-analyzer'
import { EditType } from '@/types/file-manifest'

// Add CSS animation styles
const animationStyles = `
  @keyframes fade-in-up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate-fade-in-up {
    animation: fade-in-up 0.3s ease-out forwards;
  }
  
  .scrollbar-hide {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
`

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = animationStyles
  if (!document.head.querySelector('style[data-workspace-animations]')) {
    styleSheet.setAttribute('data-workspace-animations', 'true')
    document.head.appendChild(styleSheet)
  }
}

interface SandboxData {
  sandboxId: string
  url: string
  [key: string]: unknown
}

interface ChatMessage {
  content: string
  type: 'user' | 'ai' | 'system' | 'file-update' | 'command' | 'error'
  timestamp: Date
  metadata?: {
    scrapedUrl?: string
    scrapedContent?: unknown
    generatedCode?: string
    appliedFiles?: string[]
    commandType?: 'input' | 'output' | 'error' | 'success'
  }
}

interface WorkspaceV3Props {
  sandboxKey: string
  sandboxId?: string | null
  className?: string
  initialPrompt?: string
}

interface ProgressState {
  step: number
  totalSteps: number
  message: string
  details?: string
  progress?: number
}

// Custom File Tree Component
interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
}

interface CustomFileTreeProps {
  files: Record<string, string>
  selectedFile?: string
  onFileSelect: (filePath: string) => void
  unsavedFiles?: Set<string>
}

function CustomFileTree({ files, selectedFile, onFileSelect, unsavedFiles }: CustomFileTreeProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())

  // Build tree structure from flat file list
  const fileTree = useMemo(() => {
    const tree: FileTreeNode[] = []
    const folderMap = new Map<string, FileTreeNode>()

    // Sort files to ensure consistent ordering
    const sortedFiles = Object.keys(files).sort()

    for (const filePath of sortedFiles) {
      const parts = filePath.split('/').filter(Boolean)
      let currentPath = ''
      let currentLevel = tree

      // Create folders for each part except the last (which is the file)
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i]
        currentPath += (currentPath ? '/' : '') + folderName

        let folder = currentLevel.find((node) => node.name === folderName && node.type === 'folder')
        if (!folder) {
          folder = {
            name: folderName,
            path: currentPath,
            type: 'folder',
            children: [],
          }
          currentLevel.push(folder)
          folderMap.set(currentPath, folder)
        }
        currentLevel = folder.children!
      }

      // Add the file
      const fileName = parts[parts.length - 1]
      currentLevel.push({
        name: fileName,
        path: filePath,
        type: 'file',
      })
    }

    // Sort each level: folders first, then files, both alphabetically
    const sortLevel = (nodes: FileTreeNode[]) => {
      nodes.sort((a, b) => {
        // Folders come before files
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1
        }
        // Within same type, sort alphabetically
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      })

      // Recursively sort children
      nodes.forEach((node) => {
        if (node.children) {
          sortLevel(node.children)
        }
      })
    }

    sortLevel(tree)
    return tree
  }, [files])

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath)
      } else {
        newSet.add(folderPath)
      }
      return newSet
    })
  }

  const renderNode = (node: FileTreeNode, depth = 0): React.ReactNode => {
    const isSelected = selectedFile === `/home/user/app/${node.path}`
    const isUnsaved = unsavedFiles?.has(`/home/user/app/${node.path}`)
    const isCollapsed = collapsedFolders.has(node.path)

    if (node.type === 'folder') {
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleFolder(node.path)}
            className='flex items-center gap-1.5 w-full pr-2 text-left py-0.5 rounded-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800'
            style={{ paddingLeft: `${6 + depth * 16}px` }}
          >
            <ChevronRight
              size={14}
              className={`transition-transform text-gray-500 ${
                isCollapsed ? 'rotate-0' : 'rotate-90'
              }`}
            />
            <FolderIcon size={14} className='text-gray-500' />
            <span className='text-gray-700 dark:text-gray-300'>{node.name}</span>
          </button>
          {!isCollapsed && node.children && (
            <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
          )}
        </div>
      )
    }

    return (
      <button
        key={node.path}
        onClick={() => onFileSelect(`/home/user/app/${node.path}`)}
        className={`flex items-center gap-1.5 w-full pr-2 text-left py-0.5 rounded-sm transition-colors ${
          isSelected
            ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
        }`}
        style={{ paddingLeft: `${6 + depth * 16}px` }}
      >
        <div className='w-3.5 flex justify-center'>
          <FileIcon size={14} className='text-gray-500' />
        </div>
        <div className='flex items-center flex-1'>
          <span className='truncate'>{node.name}</span>
          {isUnsaved && <span className='w-2 h-2 bg-orange-500 rounded-full ml-2 shrink-0' />}
        </div>
      </button>
    )
  }

  return <div className='text-sm'>{fileTree.map((node) => renderNode(node))}</div>
}

export function WorkspaceV3({ sandboxKey, sandboxId, className, initialPrompt }: WorkspaceV3Props) {
  const [sandboxData, setSandboxData] = useState<SandboxData | null>(null)
  const [status, setStatus] = useState({ text: 'Not connected', active: false })
  const [structureContent, setStructureContent] = useState('No sandbox created yet')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [aiChatInput, setAiChatInput] = useState('')
  const searchParams = useSearchParams()
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)
  const [progressState, setProgressState] = useState<ProgressState | null>(null)
  const [view, setView] = useState<'code' | 'preview' | 'settings'>('code')
  const [visualEditorMode, setVisualEditorMode] = useState(false)
  const [selectedElement, setSelectedElement] = useState<{
    selector: string
    componentPath?: string
    componentName?: string
    line?: number
    column?: number
    elementType: string
    textContent: string
    bounds: { x: number; y: number; width: number; height: number }
  } | null>(null)
  const [isEditingWithAI, setIsEditingWithAI] = useState(false)
  const [codeApplicationState] = useState<CodeApplicationState>({
    stage: null,
  })

  // File handling state (replacing store factory)
  const [files, setFiles] = useState<Record<string, string>>({})

  // Infer component path and line from current files given element text/selector
  const inferComponentFromFiles = (
    text: string,
    selector: string
  ): { path?: string; line?: number } => {
    try {
      const trimmed = (text || '').trim()
      const candidates: Array<{ path: string; score: number; line: number | undefined }> = []
      const classTokens: string[] = []
      // extract simple class names from selector like div.class1.class2 > ...
      selector.split(/[\s>]+/).forEach((seg) => {
        seg
          .split('.')
          .slice(1)
          .forEach((cls) => {
            if (cls) classTokens.push(cls)
          })
      })

      for (const [path, content] of Object.entries(files)) {
        const isCode = /\.(tsx|jsx|ts|js)$/.test(path)
        if (!isCode) continue

        let score = 0
        let lineMatch: number | undefined = undefined

        if (trimmed.length > 0) {
          const idx = content.indexOf(trimmed)
          if (idx >= 0) {
            score += Math.min(50, trimmed.length)
            lineMatch = content.substring(0, idx).split('\n').length
          }
        }

        if (classTokens.length > 0) {
          let classScore = 0
          for (const cls of classTokens) {
            if (content.includes(cls)) classScore += 5
          }
          score += classScore
        }

        if (score > 0) {
          candidates.push({ path, score, line: lineMatch })
        }
      }

      if (candidates.length === 0) return { path: undefined, line: undefined }
      candidates.sort((a, b) => b.score - a.score)
      return { path: candidates[0].path, line: candidates[0].line }
    } catch {
      return { path: undefined, line: undefined }
    }
  }

  // Convert files to FileMap format for FileTree
  const fileMap = useMemo((): FileMap => {
    const result: FileMap = {}
    const folders = new Set<string>()

    // First pass: normalize paths and collect folders
    const normalizedFiles: Array<{ path: string; content: string }> = []

    Object.entries(files).forEach(([path, content]) => {
      // Normalize path - ensure it starts with /home/user/app/ for FileTree
      let normalizedPath = path
      if (!normalizedPath.startsWith('/home/user/app/')) {
        if (normalizedPath.startsWith('/')) {
          normalizedPath = `/home/user/app${normalizedPath}`
        } else {
          normalizedPath = `/home/user/app/${normalizedPath}`
        }
      }

      normalizedFiles.push({ path: normalizedPath, content })

      // Extract all parent directories
      const parts = normalizedPath.split('/').filter(Boolean)
      let currentPath = ''
      for (let i = 0; i < parts.length - 1; i++) {
        // -1 to exclude the file itself
        currentPath += '/' + parts[i]
        folders.add(currentPath)
      }
    })

    // Add all folders to the result
    folders.forEach((folderPath) => {
      const folder: Folder = {
        type: 'folder',
      }
      result[folderPath] = folder
    })

    // Add all files to the result
    normalizedFiles.forEach(({ path, content }) => {
      const file: File = {
        type: 'file',
        content,
        isBinary: false,
      }
      result[path] = file
    })

    console.log('[fileMap] Generated fileMap with', Object.keys(result).length, 'entries')
    console.log('[fileMap] Folders:', Array.from(folders))
    console.log(
      '[fileMap] Files:',
      normalizedFiles.map((f) => f.path)
    )
    console.log('[fileMap] Sample fileMap entry:', Object.entries(result)[0])
    console.log('[fileMap] All fileMap keys:')
    Object.keys(result).forEach((key, index) => {
      console.log(`  [${index}] ${key} -> ${result[key]?.type}`)
    })
    return result
  }, [files])
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined)
  const [editorDocument, setEditorDocument] = useState<EditorDocument | undefined>(undefined)
  const [unsavedFiles, setUnsavedFiles] = useState<Set<string>>(new Set())

  const chatMessagesRef = useRef<HTMLDivElement>(null)

  // Helper functions
  const updateStatus = (text: string, active: boolean) => {
    setStatus({ text, active })
  }

  const log = (message: string) => {
    l.info({ key: 'workspace_v3:info', sandboxKey, message })
  }

  // Response area functionality removed - was unused

  // Load existing sandbox info from provider system
  const loadSandboxInfo = async (targetSandboxId: string) => {
    try {
      updateStatus('Loading sandbox...', false)

      // Try to get sandbox info from the provider system first
      const response = await fetch(`/api/projects/${sandboxKey}`)
      const data = (await response.json()) as { project?: { default_domain?: string } }

      if (data && data.project) {
        const project = data.project
        let previewUrl = project.default_domain

        // Ensure URL has correct format - fallback if needed
        if (!previewUrl || !previewUrl.includes('5173-')) {
          previewUrl = `https://5173-${sandboxId}.e2b.dev`
          console.log('[WorkspaceV3] Using fallback URL format:', previewUrl)
        }

        // Ensure https:// prefix
        if (!previewUrl.startsWith('https://')) {
          previewUrl = `https://${previewUrl}`
        }

        const loadedSandboxData = {
          sandboxId: targetSandboxId,
          url: previewUrl,
          isActive: true,
        }

        setSandboxData(loadedSandboxData)
        updateStatus('Sandbox connected', true)

        // Debug logging
        console.log('[WorkspaceV3] Loaded existing sandbox with URL:', previewUrl)
        l.info(
          {
            key: 'workspace_v3:sandbox_loaded',
            sandboxId: targetSandboxId,
            url: previewUrl,
            source: 'project-data',
          },
          'WorkspaceV3 loaded existing sandbox'
        )

        return loadedSandboxData
      } else {
        throw new Error('Project not found or no sandbox associated')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      l.error({ key: 'workspace_v3:load_sandbox_error', error: errorMessage })
      updateStatus('Failed to load sandbox', false)
      throw error
    }
  }

  // Load sandbox files (replacing store-based approach)
  const loadSandboxFiles = async () => {
    if (!sandboxData?.sandboxId) {
      console.log('[loadSandboxFiles] No sandboxId available:', sandboxData)
      return
    }

    try {
      console.log('[loadSandboxFiles] Fetching files for sandbox:', sandboxData.sandboxId)
      const response = await fetch(`/api/sandbox/files?sandboxId=${sandboxData.sandboxId}`)

      console.log('[loadSandboxFiles] Response status:', response.status, response.statusText)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = (await response.json()) as {
        success?: boolean
        files?: Record<string, string>
        serverError?: string
      }
      console.log('[loadSandboxFiles] API response:', data)
      console.log('[loadSandboxFiles] Response keys:', Object.keys(data))
      console.log('[loadSandboxFiles] Data success:', data.success)
      console.log(
        '[loadSandboxFiles] Data files count:',
        data.files ? Object.keys(data.files).length : 0
      )

      if (data.success && data.files) {
        setFiles(data.files)
        log(`Loaded ${Object.keys(data.files).length} files from sandbox`)
        console.log('[loadSandboxFiles] Files loaded:', Object.keys(data.files))

        // Log file filtering info
        console.log('[loadSandboxFiles] File filtering info:')
        console.log('  - Total files loaded:', Object.keys(data.files).length)
        console.log(
          '  - File types included:',
          [...new Set(Object.keys(data.files).map((f) => f.split('.').pop()))].sort()
        )

        // Update structure content
        const fileList = Object.keys(data.files)
          .map((path) => `  ${path}`)
          .join('\n')
        setStructureContent(`Project Structure:\n${fileList}`)
      } else {
        console.error('[loadSandboxFiles] API returned error or no files:', data)
        console.error('[loadSandboxFiles] Expected success=true and files object, got:', {
          success: data.success,
          hasFiles: !!data.files,
          serverError: data.serverError,
        })
        l.error({
          key: 'workspace_v3:fetch_files_error',
          error: data.serverError || 'No files returned or success=false',
          responseData: data,
        })
      }
    } catch (error) {
      console.error('[loadSandboxFiles] Fetch failed:', error)
      l.error({
        key: 'workspace_v3:fetch_files_error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // File selection handler
  const handleFileSelect = (filePath?: string) => {
    console.log('[handleFileSelect] Selected file:', filePath)
    console.log('[handleFileSelect] Available files:', Object.keys(files))

    // Convert normalized path back to original path for files lookup
    let originalPath = filePath
    if (filePath?.startsWith('/home/user/app/')) {
      originalPath = filePath.replace('/home/user/app/', '')
    }

    console.log('[handleFileSelect] Original path for lookup:', originalPath)
    console.log(
      '[handleFileSelect] File content exists:',
      originalPath ? !!files[originalPath] : false
    )

    if (originalPath && files[originalPath]) {
      console.log('[handleFileSelect] File content length:', files[originalPath].length)
    }

    setSelectedFile(filePath)
    if (originalPath && files[originalPath] && filePath) {
      setEditorDocument({
        filePath,
        value: files[originalPath],
        isBinary: false,
      })
    } else {
      console.log(
        '[handleFileSelect] No content found for file. FilePath:',
        filePath,
        'OriginalPath:',
        originalPath
      )
      setEditorDocument(undefined)
    }
  }

  // Editor change handler
  const handleEditorChange = (content: string) => {
    if (selectedFile) {
      // Convert normalized path back to original path for files state
      let originalPath = selectedFile
      if (selectedFile.startsWith('/home/user/app/')) {
        originalPath = selectedFile.replace('/home/user/app/', '')
      }

      setFiles((prev) => ({ ...prev, [originalPath]: content }))
      setUnsavedFiles((prev) => new Set([...prev, selectedFile]))

      // Update editor document
      setEditorDocument((prev) => (prev ? { ...prev, value: content } : undefined))
    }
  }

  // File save handler
  const handleFileSave = async () => {
    if (!selectedFile || !sandboxData?.sandboxId) return

    try {
      // Convert normalized path back to original path for files lookup
      let originalPath = selectedFile
      if (selectedFile.startsWith('/home/user/app/')) {
        originalPath = selectedFile.replace('/home/user/app/', '')
      }

      const fileContent = files[originalPath]
      if (!fileContent) return

      // Save file to sandbox using the new sandbox API
      const response = await fetch('/api/sandbox/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandboxId: sandboxData.sandboxId,
          filePath: originalPath,
          content: fileContent,
        }),
      })

      const result = (await response.json()) as { success?: boolean; error?: string }

      if (result.success) {
        // Mark as saved
        setUnsavedFiles((prev) => {
          const newSet = new Set(prev)
          newSet.delete(selectedFile)
          return newSet
        })
        log(`Saved ${selectedFile}`)
      } else {
        throw new Error(result.error || 'Failed to save file')
      }
    } catch (error) {
      l.error({ key: 'workspace_v3:save_file_error', error })
      // You could add a toast notification here
      console.error('Failed to save file:', error)
    }
  }

  /**
   * Determine if user request should be treated as an edit vs initial generation
   */
  const determineIfEdit = (prompt: string, currentFiles: Record<string, unknown>): boolean => {
    console.log(`[determineIfEdit] Analyzing prompt: "${prompt}"`)
    console.log(`[determineIfEdit] Current files count: ${Object.keys(currentFiles).length}`)

    // If we have existing files, it's likely an edit
    if (Object.keys(currentFiles).length > 0) {
      console.log(`[determineIfEdit] Has existing files, treating as edit`)
      return true
    }

    // Use the proper intent analyzer to determine edit type
    try {
      // Create a minimal manifest for analysis
      const manifest = {
        entryPoint: 'src/App.tsx',
        files: Object.keys(currentFiles).reduce(
          (acc, path) => {
            acc[path] = {
              content: '',
              imports: [],
              type: 'component' as const,
              lastModified: Date.now(),
              path,
              relativePath: path.replace(/^\/home\/user\/app\//, ''),
            }
            return acc
          },
          {} as Record<string, any>
        ),
        routes: [],
        componentTree: {},
        styleFiles: [],
        timestamp: Date.now(),
      }

      console.log(`[determineIfEdit] Running intent analysis...`)
      const intent = analyzeEditIntent(prompt, manifest)

      // Consider it an edit if it's not a full rebuild
      const isEditOperation = intent.type !== EditType.FULL_REBUILD

      console.log(`[determineIfEdit] Intent analysis result:`)
      console.log(`  - Type: ${intent.type}`)
      console.log(`  - Description: ${intent.description}`)
      console.log(`  - Confidence: ${intent.confidence}`)
      console.log(`  - Is Edit: ${isEditOperation}`)

      // Additional safety check: if prompt contains "create", "build", or "make" + page/app/website
      // and we have no existing files, it's likely initial creation
      if (Object.keys(currentFiles).length === 0) {
        const lowerPrompt = prompt.toLowerCase().trim()
        const isCreationPrompt =
          /\b(create|build|make)\s+(a\s+)?(\w+\s+)?(landing\s+page|website|app|application|page)\b/.test(
            lowerPrompt
          )
        if (isCreationPrompt) {
          console.log(
            `[determineIfEdit] Override: Creation prompt detected with no existing files, treating as initial generation`
          )
          return false
        }
      }

      return isEditOperation
    } catch (error) {
      console.warn(
        '[determineIfEdit] Intent analysis failed, falling back to simple detection:',
        error
      )

      // Fallback: simple pattern matching for common edit keywords
      const lowerPrompt = prompt.toLowerCase().trim()
      const hasEditKeyword =
        /\b(add|update|change|modify|edit|fix|remove|delete|style|refactor)\b/.test(lowerPrompt)

      console.log(`[determineIfEdit] Fallback pattern test: ${hasEditKeyword}`)
      return hasEditKeyword
    }
  }

  // Enhanced chat handler using the orchestrator
  const handleChatSend = async (content: string): Promise<ChatMessage> => {
    try {
      const lower = content.toLowerCase().trim()

      // Ensure sandbox exists first
      if (!sandboxData || !status.active) {
        // If we have a sandboxId prop but no sandboxData, load the existing sandbox
        if (sandboxId) {
          try {
            await loadSandboxInfo(sandboxId)
            await loadSandboxFiles()

            // Don't return a message, just continue with the original request
            // The sandbox is now loaded and we can proceed with the user's request
          } catch (error) {
            return {
              content: `Failed to load sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`,
              type: 'error',
              timestamp: new Date(),
            }
          }
        } else {
          // No sandboxId provided - this shouldn't happen in normal flow
          return {
            content: 'No sandbox available. Please create a project first.',
            type: 'error',
            timestamp: new Date(),
          }
        }
      }

      // Special commands
      if (lower === 'npm install' || lower === 'install packages' || lower === 'check packages') {
        const commandResponse = await fetch('/api/sandbox/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'npm install' }),
        })
        const res = (await commandResponse.json()) as {
          serverError?: string
          data?: { success?: boolean }
        }
        if (res.serverError || res.data?.success === false) {
          return {
            content: res.serverError || 'npm install failed',
            type: 'error',
            timestamp: new Date(),
          }
        }
        return {
          content: 'Packages installed successfully!',
          type: 'system',
          timestamp: new Date(),
        }
      }

      if (lower === 'refresh files' || lower === 'reload files') {
        await loadSandboxFiles()
        return { content: 'Files refreshed from sandbox.', type: 'system', timestamp: new Date() }
      }

      // Determine if this is an edit using intent analysis
      const isEdit = determineIfEdit(content, files)
      console.log(`[handleChatSend] Final isEdit decision: ${isEdit}`)

      try {
        // Use the streaming AI generation endpoint
        setIsGeneratingCode(true)
        setProgressState({ step: 1, totalSteps: 5, message: 'Starting AI generation...' })

        const fullContext = {
          sandboxId: sandboxData?.sandboxId,
          structure: structureContent,
          recentMessages: chatMessages.slice(-20),
          currentCode: '',
          sandboxUrl: sandboxData?.url,
          currentFiles: files,
          conversationContext: {
            currentProject: searchParams.get('projectId') || undefined,
          },
          userId: searchParams.get('userId') || undefined,
          visualEditorContext: selectedElement
            ? {
                selectedElement: {
                  selector: selectedElement.selector,
                  elementType: selectedElement.elementType,
                  textContent: selectedElement.textContent,
                  bounds: selectedElement.bounds,
                },
                isVisualEdit: true,
              }
            : undefined,
        }

        console.log(`[handleChatSend] Sending request with isEdit: ${isEdit}`)
        console.log(`[handleChatSend] Request payload:`, {
          prompt: content,
          model: 'anthropic/claude-sonnet-4-20250514',
          context: fullContext,
          isEdit: isEdit,
        })

        const response = await fetch('/api/generate-ai-code-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: content,
            model: 'anthropic/claude-sonnet-4-20250514',
            context: fullContext,
            isEdit: isEdit,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let generatedCode = ''
        let explanation = ''
        let buffer = ''

        if (reader) {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            buffer += chunk
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              // Skip empty lines and SSE comments (keepalive)
              if (!line.trim() || line.startsWith(':')) continue

              if (line.startsWith('data: ')) {
                try {
                  const jsonStr = line.slice(6).trim()
                  if (!jsonStr) continue

                  const data = JSON.parse(jsonStr) as {
                    type?: string
                    message?: string
                    duration?: number
                    text?: string
                    fileName?: string
                    current?: number
                    total?: number
                    action?: string
                    generatedCode?: string
                    explanation?: string
                    error?: string
                    success?: boolean
                    content?: string
                    name?: string
                    path?: string
                    raw?: string
                  }

                  // Validate that data is an object with a type property
                  if (!data || typeof data !== 'object' || !data.type) {
                    console.warn('[WorkspaceV3] Invalid data format:', data)
                    continue
                  }

                  if (data.type === 'status') {
                    setProgressState((prev) =>
                      prev
                        ? {
                            ...prev,
                            message: data.message || 'Processing...',
                          }
                        : {
                            step: 1,
                            totalSteps: 5,
                            message: data.message || 'Processing...',
                          }
                    )
                  } else if (data.type === 'thinking') {
                    setProgressState((prev) =>
                      prev
                        ? {
                            ...prev,
                            message: 'AI is thinking...',
                            details: 'Analyzing your request...',
                          }
                        : {
                            step: 1,
                            totalSteps: 5,
                            message: 'AI is thinking...',
                            details: 'Analyzing your request...',
                          }
                    )
                  } else if (data.type === 'thinking_complete') {
                    setProgressState((prev) =>
                      prev
                        ? {
                            ...prev,
                            message: 'Analysis complete',
                            details: `Thought for ${data.duration || 0} seconds`,
                          }
                        : {
                            step: 2,
                            totalSteps: 5,
                            message: 'Analysis complete',
                            details: `Thought for ${data.duration || 0} seconds`,
                          }
                    )
                  } else if (data.type === 'conversation') {
                    // Add conversational text to chat only if it's not code
                    let text = data.text || ''

                    // Remove package tags from the text
                    text = text.replace(/<package>[^<]*<\/package>/g, '')
                    text = text.replace(/<packages>[^<]*<\/packages>/g, '')

                    // Filter out any XML tags and file content that slipped through
                    if (
                      !text.includes('<file') &&
                      !text.includes('import React') &&
                      !text.includes('export default') &&
                      !text.includes('className=') &&
                      text.trim().length > 0
                    ) {
                      return {
                        content: text.trim(),
                        type: 'ai',
                        timestamp: new Date(),
                      }
                    }
                  } else if (data.type === 'stream' && data.raw) {
                    setProgressState((prev) =>
                      prev
                        ? {
                            ...prev,
                            message: 'Generating code...',
                            details: 'Writing components and files...',
                          }
                        : {
                            step: 3,
                            totalSteps: 5,
                            message: 'Generating code...',
                            details: 'Writing components and files...',
                          }
                    )
                  } else if (data.type === 'file-progress') {
                    // Real-time file creation progress
                    setProgressState((prev) =>
                      prev
                        ? {
                            ...prev,
                            message: `Creating ${data.fileName || 'file'}...`,
                            details: `Progress: ${data.current}/${data.total} files`,
                          }
                        : {
                            step: 3,
                            totalSteps: 5,
                            message: `Creating ${data.fileName || 'file'}...`,
                            details: `Progress: ${data.current}/${data.total} files`,
                          }
                    )
                  } else if (data.type === 'file-complete') {
                    // File was created/updated - add it to file tree immediately
                    const fileName = data.fileName
                    if (fileName) {
                      console.log(`[Real-time] File ${data.action}: ${fileName}`)

                      // Try to load the file content from sandbox immediately
                      try {
                        const fileResponse = await fetch(
                          `/api/sandbox/file?sandboxId=${sandboxData?.sandboxId}&filePath=${encodeURIComponent(fileName)}`
                        )
                        if (fileResponse.ok) {
                          const fileData = (await fileResponse.json()) as {
                            success?: boolean
                            content?: string
                          }
                          if (fileData.success && fileData.content) {
                            setFiles((prev) => ({
                              ...prev,
                              [fileName]: fileData.content || '',
                            }))
                            console.log(`[Real-time] Added file to tree: ${fileName}`)
                          }
                        }
                      } catch (error) {
                        console.warn(
                          `[Real-time] Failed to load file content for ${fileName}:`,
                          error
                        )
                        // Add file to tree without content as placeholder
                        setFiles((prev) => ({
                          ...prev,
                          [fileName]: '// Loading...',
                        }))
                      }
                    }

                    setProgressState((prev) =>
                      prev
                        ? {
                            ...prev,
                            message: `${data.action === 'created' ? 'Created' : 'Updated'} ${fileName}`,
                            details: `File ${data.action} successfully`,
                          }
                        : {
                            step: 3,
                            totalSteps: 5,
                            message: `${data.action === 'created' ? 'Created' : 'Updated'} ${fileName}`,
                            details: `File ${data.action} successfully`,
                          }
                    )
                  } else if (data.type === 'component') {
                    setProgressState((prev) =>
                      prev
                        ? {
                            ...prev,
                            message: `Generated ${data.name || 'component'}`,
                            details: `Component: ${data.path || 'unknown'}`,
                          }
                        : {
                            step: 3,
                            totalSteps: 5,
                            message: `Generated ${data.name || 'component'}`,
                            details: `Component: ${data.path || 'unknown'}`,
                          }
                    )
                  } else if (data.type === 'package') {
                    setProgressState((prev) =>
                      prev
                        ? {
                            ...prev,
                            message: data.message || `Installing ${data.name || 'package'}`,
                            details: 'Setting up dependencies...',
                          }
                        : {
                            step: 4,
                            totalSteps: 5,
                            message: data.message || `Installing ${data.name || 'package'}`,
                            details: 'Setting up dependencies...',
                          }
                    )
                  } else if (data.type === 'complete') {
                    generatedCode = data.generatedCode || ''
                    explanation = data.explanation || ''

                    setProgressState((prev) =>
                      prev
                        ? {
                            ...prev,
                            message: 'Generation complete!',
                            progress: 100,
                          }
                        : {
                            step: 5,
                            totalSteps: 5,
                            message: 'Generation complete!',
                            progress: 100,
                          }
                    )
                  } else if (data.type === 'error') {
                    throw new Error(data.error || 'Unknown streaming error')
                  }
                } catch {
                  const linePreview = line.substring(0, 100)

                  // Only log if it's not an empty line or keepalive
                  if (line.trim() && !line.startsWith(': keepalive')) {
                    console.warn('[WorkspaceV3] Skipping unparseable line:', linePreview)
                    l.info({
                      key: 'workspace_v3:stream_skip_line',
                      reason: 'unparseable_json',
                      preview: linePreview,
                    })
                  }
                  // Continue processing other lines instead of breaking
                  continue
                }
              }
            }
          }
        }

        if (generatedCode) {
          // Parse files from generated code for metadata
          const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g
          const generatedFiles: string[] = []
          let match
          while ((match = fileRegex.exec(generatedCode)) !== null) {
            generatedFiles.push(match[1])
          }

          // Show appropriate message based on edit mode
          const responseMessage =
            isEdit && generatedFiles.length > 0
              ? `Updated ${generatedFiles.map((f) => f.split('/').pop()).join(', ')}`
              : explanation || 'Code generated successfully!'

          // Streaming route already applies changes; return result
          return {
            content: responseMessage,
            type: 'ai',
            timestamp: new Date(),
            metadata: {
              appliedFiles: generatedFiles,
            },
          }
        }

        return {
          content: 'Code generation completed but no code was generated.',
          type: 'system',
          timestamp: new Date(),
        }
      } catch (error) {
        l.error({ key: 'workspace_v3:generation_error', error })
        return {
          content: `Failed to generate code: ${error instanceof Error ? error.message : 'Unknown error'}`,
          type: 'error',
          timestamp: new Date(),
        }
      } finally {
        setIsGeneratingCode(false)
        setProgressState(null)
      }
    } catch (error) {
      l.error({ key: 'workspace_v3:chat_send_error', error })
      return {
        content: 'Error processing your message. Please try again.',
        type: 'error',
        timestamp: new Date(),
      }
    }
  }

  const handleSendMessage = () => {
    if (!aiChatInput.trim()) return

    // Prepare the actual prompt to send to AI
    let actualPrompt = aiChatInput

    // If in AI editing mode, automatically include visual editor context
    if (isEditingWithAI && selectedElement) {
      const visualContext = `Edit the ${selectedElement.elementType} element${selectedElement.componentPath ? ` in ${selectedElement.componentPath}` : ''} with selector "${selectedElement.selector}" that contains "${selectedElement.textContent.slice(0, 50)}...". 

User request: ${aiChatInput}

Please make the requested changes to this specific element.`
      actualPrompt = visualContext
    }

    const userMessage: ChatMessage = {
      content: aiChatInput, // Show only user's input in chat
      type: 'user',
      timestamp: new Date(),
    }

    setChatMessages((prev) => [...prev, userMessage])

    // Process the message with the actual prompt (including context if editing)
    void handleChatSend(actualPrompt).then((response) => {
      setChatMessages((prev) => [...prev, response])

      // Exit editing mode after successful generation but keep visual editor active
      if (isEditingWithAI) {
        setIsEditingWithAI(false)
        // Keep selectedElement and visualEditorMode active so user can continue editing
      }
    })

    setAiChatInput('')
  }

  // Load chat history from database via API
  const loadChatHistory = async () => {
    const projectId = searchParams.get('projectId')
    if (!projectId) return

    try {
      const response = await fetch(`/api/chat/history?projectId=${projectId}`)
      const result = (await response.json()) as {
        success?: boolean
        messages?: Array<{ content: string; role: string; timestamp?: string; created_at?: string }>
        error?: string
      }

      if (result.success && Array.isArray(result.messages)) {
        const chatHistory: ChatMessage[] = result.messages.map((msg) => ({
          content: msg.content,
          type: msg.role === 'user' ? 'user' : 'ai',
          timestamp: new Date(msg.timestamp || msg.created_at || Date.now()),
        }))

        setChatMessages(chatHistory)
        console.log(`[WorkspaceV3] Loaded ${chatHistory.length} chat messages`)
      } else {
        console.warn('[WorkspaceV3] No chat history found or failed to load:', result.error)
      }
    } catch (error) {
      console.error('[WorkspaceV3] Failed to load chat history:', error)
    }
  }

  // Initialize sandbox if sandboxId is provided
  useEffect(() => {
    if (sandboxId && !sandboxData) {
      loadSandboxInfo(sandboxId)
        .then(() => {
          // Load initial files immediately after sandbox connection
          void loadSandboxFiles()
          // Load chat history
          void loadChatHistory()
        })
        .catch((error) => {
          l.error({
            key: 'workspace_v3:init_error',
            error: error instanceof Error ? error.message : 'Unknown error',
            sandboxId,
          })
        })
    }
  }, [sandboxId, sandboxData])

  // Auto-scroll chat messages
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }, [chatMessages])

  // Handle visual editor mode changes - switch iframe src between proxy and direct
  useEffect(() => {
    if (view === 'preview' && sandboxData) {
      const iframe = document.querySelector('iframe[title="Preview"]') as HTMLIFrameElement
      if (iframe) {
        console.log('[Visual Editor] Mode changed to:', visualEditorMode)
        const newSrc = visualEditorMode
          ? `/api/sandbox/visual-editor-proxy?sandboxId=${sandboxData.sandboxId}&path=/`
          : sandboxData.url
        if (iframe.src !== newSrc) {
          iframe.src = newSrc
        }
      }
    }
  }, [visualEditorMode, view, sandboxData])

  // Handle initial prompt - only if not already in chat history
  useEffect(() => {
    if (initialPrompt && sandboxData && chatMessages.length > 0) {
      // Check if the initial prompt is already in the chat history
      const hasInitialPrompt = chatMessages.some(
        (msg) => msg.type === 'user' && msg.content.trim() === initialPrompt.trim()
      )

      if (!hasInitialPrompt) {
        const userMessage: ChatMessage = {
          content: initialPrompt,
          type: 'user',
          timestamp: new Date(),
        }

        setChatMessages((prev) => [...prev, userMessage])

        void handleChatSend(initialPrompt).then((response) => {
          setChatMessages((prev) => [...prev, response])
        })
      }
    } else if (initialPrompt && sandboxData && chatMessages.length === 0) {
      // First load with no chat history - process the initial prompt
      const userMessage: ChatMessage = {
        content: initialPrompt,
        type: 'user',
        timestamp: new Date(),
      }

      setChatMessages((prev) => [...prev, userMessage])

      void handleChatSend(initialPrompt).then((response) => {
        setChatMessages((prev) => [...prev, response])
      })
    }
  }, [initialPrompt, chatMessages.length, sandboxData])

  return (
    <div className={cn('h-screen w-full p-4 overflow-hidden', className)}>
      {/* Header removed as requested */}

      <div className='h-full flex bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-lg overflow-hidden'>
        {/* Left: Chat */}
        <div className='w-[360px] h-full border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col overflow-hidden'>
          {/* Chat Messages - Scrollable Area */}
          <div
            className='flex-1 min-h-0 overflow-y-auto p-6'
            ref={chatMessagesRef}
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#cbd5e0 transparent',
            }}
          >
            <div className='flex flex-col'>
              {chatMessages.map((message, index) => (
                <div key={index} className='mb-3'>
                  <div
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`inline-block rounded-lg px-3 py-2 max-w-[85%] ${
                        message.type === 'user'
                          ? 'bg-blue-500 text-white'
                          : message.type === 'ai'
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                            : message.type === 'system'
                              ? 'bg-gray-500 text-white text-sm'
                              : message.type === 'command'
                                ? 'bg-gray-800 text-green-400 font-mono text-sm'
                                : message.type === 'error'
                                  ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 text-sm border border-red-300 dark:border-red-700'
                                  : 'bg-gray-500 text-white text-sm'
                      }`}
                    >
                      {message.type === 'command' ? (
                        <div className='flex items-start gap-2'>
                          <span
                            className={`text-xs ${
                              message.metadata?.commandType === 'input'
                                ? 'text-blue-400'
                                : message.metadata?.commandType === 'error'
                                  ? 'text-red-400'
                                  : message.metadata?.commandType === 'success'
                                    ? 'text-green-400'
                                    : 'text-gray-400'
                            }`}
                          >
                            {message.metadata?.commandType === 'input' ? '$' : '>'}
                          </span>
                          <span className='flex-1 whitespace-pre-wrap text-white'>
                            {message.content}
                          </span>
                        </div>
                      ) : message.type === 'error' ? (
                        <div className='flex items-start gap-3'>
                          <div className='flex-shrink-0'>
                            <div className='w-8 h-8 bg-red-800 rounded-full flex items-center justify-center'>
                              <svg
                                className='w-6 h-6 text-red-200'
                                fill='none'
                                viewBox='0 0 24 24'
                                stroke='currentColor'
                              >
                                <path
                                  strokeLinecap='round'
                                  strokeLinejoin='round'
                                  strokeWidth={2}
                                  d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
                                />
                              </svg>
                            </div>
                          </div>
                          <div className='flex-1'>
                            <div className='font-semibold mb-1'>Build Errors Detected</div>
                            <div className='whitespace-pre-wrap text-sm'>{message.content}</div>
                            <div className='mt-2 text-xs opacity-70'>
                              Check the error details above
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className='text-sm leading-relaxed'>{message.content}</span>
                      )}
                    </div>

                    {/* Show applied files if this is an apply success message */}
                    {message.metadata?.appliedFiles && message.metadata.appliedFiles.length > 0 && (
                      <div className='mt-2 inline-block bg-gray-50 dark:bg-gray-700 rounded-lg p-3 max-w-[85%]'>
                        <div className='text-xs font-medium mb-2 text-gray-600 dark:text-gray-300'>
                          {message.content.includes('Applied')
                            ? 'Files Updated:'
                            : 'Generated Files:'}
                        </div>
                        <div className='flex flex-wrap gap-1.5'>
                          {message.metadata.appliedFiles.map((filePath, fileIdx) => {
                            const fileName = filePath.split('/').pop() || filePath
                            const fileExt = fileName.split('.').pop() || ''
                            const fileType =
                              fileExt === 'jsx' || fileExt === 'js'
                                ? 'javascript'
                                : fileExt === 'css'
                                  ? 'css'
                                  : fileExt === 'json'
                                    ? 'json'
                                    : 'text'

                            return (
                              <div
                                key={`applied-${fileIdx}`}
                                className='inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs font-medium'
                                style={{ animationDelay: `${fileIdx * 30}ms` }}
                              >
                                <span
                                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                                    fileType === 'css'
                                      ? 'bg-blue-400'
                                      : fileType === 'javascript'
                                        ? 'bg-yellow-400'
                                        : fileType === 'json'
                                          ? 'bg-green-400'
                                          : 'bg-gray-400'
                                  }`}
                                />
                                {fileName}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Code application progress */}
              {codeApplicationState.stage && (
                <CodeApplicationProgress state={codeApplicationState} />
              )}

              {/* File generation progress - inline display (during generation) */}
              {isGeneratingCode && (
                <div className='flex justify-start'>
                  <div className='inline-block bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 max-w-[85%]'>
                    <div className='text-sm font-medium mb-1 text-gray-700 dark:text-gray-300'>
                      {progressState?.message || 'Generating code...'}
                    </div>
                    <div className='flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs'>
                      <div className='w-3 h-3 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin' />
                      Processing...
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Editing Status - shown when in AI editing mode */}
          {isEditingWithAI && selectedElement && (
            <div className='flex-shrink-0 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center space-x-2'>
                  <div className='w-2 h-2 bg-blue-500 rounded-full animate-pulse'></div>
                  <span className='text-sm font-medium text-blue-700 dark:text-blue-300'>
                    Editing
                  </span>
                </div>
                <button
                  onClick={() => {
                    setIsEditingWithAI(false)
                    setSelectedElement(null)
                  }}
                  className='text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200'
                >
                  Cancel
                </button>
              </div>
              <div className='mt-1 text-xs text-blue-600 dark:text-blue-400'>
                <div className='font-medium'>
                  {selectedElement.elementType} in {selectedElement.componentPath || 'component'}
                </div>
                <div className='text-blue-500 dark:text-blue-500 truncate'>
                  "{selectedElement.textContent.slice(0, 60)}
                  {selectedElement.textContent.length > 60 ? '...' : ''}"
                </div>
                <div className='text-xs text-blue-400 dark:text-blue-500 mt-1'>
                  Selector: {selectedElement.selector}
                </div>
              </div>
            </div>
          )}

          {/* Chat Input - Fixed at bottom */}
          <div className='flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-800'>
            <div className='flex space-x-2'>
              <input
                type='text'
                placeholder={
                  isEditingWithAI
                    ? 'Describe how to modify this element...'
                    : 'Describe what to build or modify...'
                }
                className='flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500'
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isGeneratingCode}
              />
              <button
                onClick={handleSendMessage}
                disabled={!aiChatInput.trim() || isGeneratingCode}
                className='px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-sm rounded transition-colors'
              >
                {isEditingWithAI ? 'Edit' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Toggle Code/Preview */}
        <div className='flex-1 min-w-0 h-full flex flex-col overflow-hidden'>
          <div className='px-3 pt-3 pb-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center'>
            <div className='inline-flex bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md p-0.5'>
              <button
                onClick={() => setView('code')}
                className={`px-3 py-1 rounded transition-all text-xs font-medium ${
                  view === 'code'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'bg-transparent text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <div className='flex items-center gap-1.5'>
                  <svg width='14' height='14' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'
                    />
                  </svg>
                  <span>Code</span>
                </div>
              </button>
              <button
                onClick={() => setView('preview')}
                className={`px-3 py-1 rounded transition-all text-xs font-medium ${
                  view === 'preview'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'bg-transparent text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <div className='flex items-center gap-1.5'>
                  <svg width='14' height='14' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
                    />
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
                    />
                  </svg>
                  <span>Preview</span>
                </div>
              </button>
              <button
                onClick={() => setView('settings')}
                className={`px-3 py-1 rounded transition-all text-xs font-medium ${
                  view === 'settings'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'bg-transparent text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <div className='flex items-center gap-1.5'>
                  <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth='2'
                      d='M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
                    />
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth='2'
                      d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
                    />
                  </svg>
                  <span>Settings</span>
                </div>
              </button>
            </div>

            {/* Visual Editor Toggle Button */}
            <div className='flex items-center gap-3'>
              {selectedElement && (
                <div className='flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400'>
                  <span>Selected:</span>
                  <code className='bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs'>
                    {selectedElement.elementType}
                  </code>
                  <button
                    onClick={() => setSelectedElement(null)}
                    className='text-xs text-red-600 hover:text-red-700 px-1'
                  >
                    ×
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  setVisualEditorMode(!visualEditorMode)
                  if (visualEditorMode) {
                    setSelectedElement(null) // Clear selection when exiting
                  }
                  if (!visualEditorMode && view !== 'preview') {
                    setView('preview') // Switch to preview when entering visual mode
                  }
                }}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-all ${
                  visualEditorMode
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122'
                  />
                </svg>
                {visualEditorMode ? 'Exit Visual Editor' : 'Visual Editor'}
              </button>
            </div>
          </div>

          <div className='flex-1 min-h-0 overflow-hidden'>
            {view === 'code' ? (
              <div className='h-full flex bg-white dark:bg-gray-950 overflow-hidden'>
                <div className='flex flex-1 min-h-0 overflow-hidden'>
                  {/* File Tree Sidebar */}
                  <div className='w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col p-2'>
                    <div className='flex items-center justify-between mb-2 px-2'>
                      <h3 className='text-sm font-semibold text-gray-700 dark:text-gray-300'>
                        Files
                      </h3>
                      <button
                        onClick={() => void loadSandboxFiles()}
                        className='text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700'
                        title='Refresh files'
                      >
                        ↻
                      </button>
                    </div>
                    <div className='flex-1 overflow-auto'>
                      {Object.keys(files).length === 0 ? (
                        <div className='px-2'>
                          <p className='text-xs text-gray-500 dark:text-gray-400'>No files yet.</p>
                          <p className='text-xs text-gray-400 dark:text-gray-500 mt-1'>
                            Create a sandbox to get started.
                          </p>
                        </div>
                      ) : (
                        <div>
                          <div className='px-2 text-xs text-gray-400 dark:text-gray-500 mb-2 flex items-center justify-between'>
                            <span>Found {Object.keys(files).length} files</span>
                            {isGeneratingCode && (
                              <div className='flex items-center gap-1 text-blue-500'>
                                <div className='w-2 h-2 bg-blue-500 rounded-full animate-pulse'></div>
                                <span className='text-xs'>Generating...</span>
                              </div>
                            )}
                          </div>
                          <CustomFileTree
                            files={files}
                            selectedFile={selectedFile}
                            onFileSelect={handleFileSelect}
                            unsavedFiles={unsavedFiles}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Editor Panel */}
                  <div className='flex-1 overflow-hidden flex flex-col'>
                    {/* Breadcrumb Header */}
                    {selectedFile && (
                      <div className='flex items-center px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900'>
                        <div className='flex items-center flex-1 text-sm'>
                          <FileBreadcrumb
                            files={fileMap}
                            selectedFile={selectedFile}
                            onFileSelect={handleFileSelect}
                          />
                          {unsavedFiles.has(selectedFile) && (
                            <div className='flex gap-1 ml-auto'>
                              <button
                                onClick={() => void handleFileSave()}
                                className='px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors'
                              >
                                Save
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Code Editor */}
                    <div className='flex-1 overflow-hidden'>
                      {selectedFile && editorDocument ? (
                        <CodeMirrorEditor
                          doc={editorDocument}
                          onChange={({ content }) => handleEditorChange(content)}
                          onSave={() => void handleFileSave()}
                          theme='dark'
                          className='h-full'
                          settings={{ fontSize: '14px', tabSize: 2 }}
                          autoFocusOnDocumentChange={true}
                          editable={!isGeneratingCode}
                        />
                      ) : (
                        <div className='h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400'>
                          {selectedFile ? (
                            <div className='text-center'>
                              <p>Loading file: {selectedFile}</p>
                              <p className='text-xs mt-2'>
                                Editor document: {editorDocument ? 'exists' : 'missing'}
                              </p>
                              <p className='text-xs'>
                                File in state: {files[selectedFile] ? 'exists' : 'missing'}
                              </p>
                            </div>
                          ) : (
                            'Select a file to view its contents'
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : view === 'preview' ? (
              <div className='h-full bg-white dark:bg-gray-950'>
                {sandboxData?.url ? (
                  <div className='relative h-full'>
                    {/* Debug info for preview URL */}
                    <div className='p-2 bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 border-b'>
                      Preview URL: {sandboxData.url}
                    </div>
                    <iframe
                      src={
                        visualEditorMode
                          ? `/api/sandbox/visual-editor-proxy?sandboxId=${sandboxData.sandboxId}&path=/`
                          : sandboxData.url
                      }
                      className='w-full h-full border-0'
                      title='Preview'
                      onLoad={() => console.log('[WorkspaceV3] iframe loaded:', sandboxData.url)}
                      onError={(e) => console.error('[WorkspaceV3] iframe error:', e)}
                      allow='clipboard-write'
                      sandbox='allow-scripts allow-same-origin allow-forms allow-popups allow-modals'
                      ref={(iframe) => {
                        if (!iframe) return

                        // Listen for messages from the iframe
                        const handleMessage = (event: MessageEvent) => {
                          // Security check - accept messages from our origin (proxy) and sandbox domain
                          const isFromOurOrigin = event.origin === window.location.origin
                          const isFromSandbox =
                            event.origin.includes('e2b.dev') || event.origin.includes('localhost')

                          if (!isFromOurOrigin && !isFromSandbox) {
                            console.log(
                              '[Visual Editor] Rejected message from origin:',
                              event.origin
                            )
                            return
                          }

                          if ((event.data as { type?: string }).type === 'ELEMENT_SELECTED') {
                            const eventData = event.data as {
                              selector?: string
                              elementType?: string
                              textContent?: string
                              bounds?: { x: number; y: number; width: number; height: number }
                              componentPath?: string
                              componentName?: string
                              line?: number
                              column?: number
                            }
                            const {
                              selector,
                              elementType,
                              textContent,
                              bounds,
                              componentPath,
                              componentName,
                              line,
                              column,
                            } = eventData
                            let finalPath = componentPath
                            let finalLine = typeof line === 'number' ? line : undefined
                            // If proxy didn't supply a path, infer from loaded files
                            if (!finalPath) {
                              const inferred = inferComponentFromFiles(
                                textContent || '',
                                selector || ''
                              )
                              finalPath = inferred.path
                              if (typeof inferred.line === 'number') finalLine = inferred.line
                            }
                            console.log('[Visual Editor] Received element selection:', event.data)

                            setSelectedElement({
                              selector: selector || '',
                              componentPath: finalPath,
                              componentName: componentName || '',
                              elementType: elementType || '',
                              textContent: textContent || '',
                              bounds: bounds || { x: 0, y: 0, width: 0, height: 0 },
                              line: finalLine,
                              column: typeof column === 'number' ? column : undefined,
                            })
                          } else if (
                            (event.data as { type?: string }).type === 'VISUAL_EDITOR_READY'
                          ) {
                            console.log('[Visual Editor] iframe is ready for visual editor')

                            // Send enable/disable message based on current mode
                            if (visualEditorMode) {
                              setTimeout(() => {
                                iframe.contentWindow?.postMessage(
                                  {
                                    type: 'ENABLE_VISUAL_EDITOR',
                                    enabled: true,
                                  },
                                  '*'
                                )
                              }, 100)
                            }
                          }
                        }

                        // Add message listener
                        window.addEventListener('message', handleMessage)

                        // Set up when iframe loads (no direct DOM access; rely on proxy injection + postMessage)
                        iframe.onload = () => {
                          console.log(
                            '[Visual Editor] iframe loaded in',
                            visualEditorMode ? 'proxy mode' : 'direct mode'
                          )
                        }

                        // Clean up event listener when component unmounts
                        return () => {
                          window.removeEventListener('message', handleMessage)
                        }
                      }}
                    />

                    {/* Visual Editor Mode Indicator */}
                    {visualEditorMode && (
                      <div className='absolute top-4 left-4 bg-blue-500 text-white px-3 py-2 rounded-md text-sm shadow-lg z-20'>
                        <div className='flex items-center gap-2'>
                          <div className='w-2 h-2 bg-white rounded-full animate-pulse'></div>
                          Visual Editor Active - Hover and click elements
                        </div>
                      </div>
                    )}

                    {/* Debug Info */}
                    {visualEditorMode && (
                      <div className='absolute top-16 left-4 bg-black/80 text-white px-2 py-1 rounded text-xs z-20'>
                        Mode: {visualEditorMode ? 'ON' : 'OFF'} | View: {view}
                      </div>
                    )}

                    {/* Selected Element Edit Button */}
                    {selectedElement && (
                      <div className='absolute bottom-4 right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 max-w-sm z-20'>
                        <div className='space-y-3'>
                          <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                            Selected Element
                          </div>

                          <div className='space-y-2'>
                            <div className='flex items-center gap-2'>
                              <span className='text-xs text-gray-500 dark:text-gray-400'>
                                Type:
                              </span>
                              <code className='bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs'>
                                {selectedElement.elementType}
                              </code>
                            </div>

                            {selectedElement.componentPath && (
                              <div className='flex items-start gap-2'>
                                <span className='mt-0.5 text-xs text-gray-500 dark:text-gray-400'>
                                  File:
                                </span>
                                <div className='flex flex-col gap-1'>
                                  <code className='bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-xs max-w-[320px] truncate'>
                                    {selectedElement.componentPath}
                                    {typeof selectedElement.line === 'number' && (
                                      <span>
                                        :{selectedElement.line}
                                        {typeof selectedElement.column === 'number'
                                          ? `:${selectedElement.column}`
                                          : ''}
                                      </span>
                                    )}
                                  </code>
                                  <div className='flex items-center gap-2'>
                                    <button
                                      className='text-xs text-blue-600 hover:underline'
                                      onClick={() => {
                                        const p = selectedElement.componentPath as string
                                        const normalized = p.startsWith('/home/user/app/')
                                          ? p
                                          : `/home/user/app/${p}`
                                        handleFileSelect(normalized)
                                      }}
                                    >
                                      Open file
                                    </button>
                                    <button
                                      className='text-xs text-gray-600 hover:underline'
                                      onClick={() =>
                                        void navigator.clipboard.writeText(
                                          `${selectedElement.componentPath}${typeof selectedElement.line === 'number' ? `:${selectedElement.line}${typeof selectedElement.column === 'number' ? `:${selectedElement.column}` : ''}` : ''}`
                                        )
                                      }
                                    >
                                      Copy path
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className='text-xs text-gray-600 dark:text-gray-300'>
                              "{selectedElement.textContent.slice(0, 50)}
                              {selectedElement.textContent.length > 50 ? '...' : ''}"
                            </div>
                            {selectedElement.componentName && (
                              <div className='text-xs text-gray-500 dark:text-gray-400'>
                                Component: {selectedElement.componentName}
                              </div>
                            )}
                          </div>

                          <div className='flex gap-2'>
                            <button
                              onClick={() => {
                                // Enter AI editing mode without showing technical context
                                setIsEditingWithAI(true)
                                setAiChatInput('') // Clear input for user prompt
                                setView('code') // Switch back to code view to see the chat
                                // Keep visual editor mode active - don't disable it
                              }}
                              className='flex-1 bg-blue-500 hover:bg-blue-600 text-white text-xs py-2 px-3 rounded-md transition-colors'
                            >
                              Edit with AI
                            </button>
                            <button
                              onClick={() => setSelectedElement(null)}
                              className='px-3 py-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Package installation overlay - shows when installing packages or applying code */}
                    {codeApplicationState.stage && codeApplicationState.stage !== 'complete' && (
                      <div className='absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-10'>
                        <div className='text-center max-w-md'>
                          <div className='mb-6'>
                            {/* Animated icon based on stage */}
                            {codeApplicationState.stage === 'installing' ? (
                              <div className='w-16 h-16 mx-auto'>
                                <svg
                                  className='w-full h-full animate-spin'
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
                                  ></circle>
                                  <path
                                    className='opacity-75'
                                    fill='currentColor'
                                    d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                                  ></path>
                                </svg>
                              </div>
                            ) : (
                              <div className='w-16 h-16 mx-auto'>
                                <div className='w-full h-full border-4 border-blue-500 border-t-transparent rounded-full animate-spin'></div>
                              </div>
                            )}
                          </div>

                          <h3 className='text-lg font-semibold text-gray-900 mb-2'>
                            {codeApplicationState.stage === 'analyzing' && 'Analyzing code...'}
                            {codeApplicationState.stage === 'installing' &&
                              'Installing packages...'}
                            {codeApplicationState.stage === 'applying' && 'Applying changes...'}
                          </h3>

                          {/* Package list during installation */}
                          {codeApplicationState.stage === 'installing' &&
                            codeApplicationState.packages && (
                              <div className='mb-4'>
                                <div className='flex flex-wrap gap-2 justify-center'>
                                  {codeApplicationState.packages.map((pkg, index) => (
                                    <span
                                      key={index}
                                      className={`px-2 py-1 text-xs rounded-full transition-all ${
                                        codeApplicationState.installedPackages?.includes(pkg)
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-gray-100 text-gray-600'
                                      }`}
                                    >
                                      {pkg}
                                      {codeApplicationState.installedPackages?.includes(pkg) && (
                                        <span className='ml-1'>✓</span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                          {/* Files being generated */}
                          {codeApplicationState.stage === 'applying' &&
                            codeApplicationState.filesGenerated && (
                              <div className='text-sm text-gray-600 mb-4'>
                                Creating {codeApplicationState.filesGenerated.length} files...
                              </div>
                            )}

                          <p className='text-sm text-gray-500 mt-2'>
                            {codeApplicationState.stage === 'analyzing' &&
                              'Parsing generated code and detecting dependencies...'}
                            {codeApplicationState.stage === 'installing' &&
                              'This may take a moment while npm installs the required packages...'}
                            {codeApplicationState.stage === 'applying' &&
                              'Writing files to your sandbox environment...'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Refresh button */}
                    <button
                      onClick={() => {
                        if (sandboxData?.url) {
                          console.log('[Manual Refresh] Forcing iframe reload...')
                          const iframe = document.querySelector(
                            'iframe[title="Preview"]'
                          ) as HTMLIFrameElement
                          if (iframe) {
                            const newSrc = `${sandboxData.url}?t=${Date.now()}&manual=true`
                            iframe.src = newSrc
                          }
                        }
                      }}
                      className='absolute bottom-4 right-4 bg-white/90 hover:bg-white text-gray-700 p-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105'
                      title='Refresh sandbox'
                    >
                      <svg
                        width='16'
                        height='16'
                        fill='none'
                        viewBox='0 0 24 24'
                        stroke='currentColor'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                        />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className='h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400'>
                    Create a sandbox to see the preview
                  </div>
                )}
              </div>
            ) : view === 'settings' ? (
              <div className='h-full bg-white dark:bg-gray-950'>
                <div className='h-full flex flex-col'>
                  {/* Settings Header */}
                  <div className='flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700'>
                    <h2 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                      Workspace Settings
                    </h2>
                  </div>

                  {/* Settings Content - Inline the settings panel content here */}
                  <div className='flex-1 overflow-hidden'>
                    <WorkspaceSettingsPanel
                      isOpen={true}
                      onClose={() => setView('code')}
                      _sandboxId={sandboxData?.sandboxId}
                      _projectName='My Project'
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
