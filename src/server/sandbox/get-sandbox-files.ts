import 'server-cli-only'

import { z } from 'zod'
import { authActionClient } from '@/lib/clients/action'
import { l } from '@/lib/clients/logger'
import { parseTypeScriptFile, buildComponentTree } from '@/lib/utils/file-parser'
import type { FileManifest, FileInfo, RouteInfo } from '@/types/file-manifest'

function extractRoutes(files: Record<string, FileInfo>): RouteInfo[] {
  const routes: RouteInfo[] = []

  // Look for React Router usage
  for (const [path, fileInfo] of Object.entries(files)) {
    if (fileInfo.content.includes('<Route') || fileInfo.content.includes('createBrowserRouter')) {
      // Extract route definitions (simplified)
      const routeMatches = fileInfo.content.matchAll(
        /path=["']([^"']+)["'].*(?:element|component)={([^}]+)}/g
      )

      for (const match of routeMatches) {
        const [, routePath] = match
        routes.push({
          path: routePath,
          component: path,
        })
      }
    }

    // Check for Next.js style pages
    if (
      fileInfo.relativePath.startsWith('pages/') ||
      fileInfo.relativePath.startsWith('src/pages/')
    ) {
      const routePath =
        '/' +
        fileInfo.relativePath
          .replace(/^(src\/)?pages\//, '')
          .replace(/\.(jsx?|tsx?)$/, '')
          .replace(/index$/, '')

      routes.push({
        path: routePath,
        component: path,
      })
    }
  }

  return routes
}

const GetSandboxFilesInputSchema = z.object({
  sandboxId: z.string().optional(),
})

export const getSandboxFiles = authActionClient
  .schema(GetSandboxFilesInputSchema)
  .metadata({ actionName: 'getSandboxFiles' })
  .action(async ({ parsedInput, ctx }) => {
    const { session } = ctx
    const { sandboxId } = parsedInput

    try {
      // Get sandbox provider
      const { sandboxManager } = await import('@/server/sandbox/manager')
      let provider = null

      if (sandboxId) {
        provider = sandboxManager.getProvider(sandboxId)
        if (!provider) {
          const { SandboxFactory } = await import('@/server/sandbox/factory')
          provider = SandboxFactory.create()
          try {
            const reconnected = await (
              provider as { reconnect?: (id: string) => Promise<boolean> }
            ).reconnect?.(sandboxId)
            if (reconnected) {
              sandboxManager.registerSandbox(sandboxId, provider)
              sandboxManager.setActiveSandbox(sandboxId)
            } else {
              provider = null
            }
          } catch (error) {
            console.warn(`Could not reconnect to sandbox ${sandboxId}:`, error)
            provider = null
          }
        }
      } else {
        provider = sandboxManager.getActiveProvider()
      }

      if (!provider) {
        l.error({ key: 'sandbox:get_files:no_active', userId: session.user.id, sandboxId })
        return { success: false as const, serverError: 'No active sandbox' }
      }

      l.info({ key: 'sandbox:get_files:start', userId: session.user.id })

      // Get list of all relevant files using direct filesystem API
      const allFiles = await provider.listFiles('/home/user/app')

      // Log all files found
      l.info({
        key: 'sandbox:get_files:all_files_found',
        count: allFiles.length,
        sampleFiles: allFiles.slice(0, 10),
        userId: session.user.id,
      })

      // Filter for relevant file types
      const allowedExtensions = ['jsx', 'js', 'tsx', 'ts', 'css', 'json']
      const fileList = allFiles.filter((file) => {
        const ext = file.split('.').pop()?.toLowerCase()
        return ext && allowedExtensions.includes(ext)
      })

      // Log filtering results
      const filteredOut = allFiles.filter((file) => {
        const ext = file.split('.').pop()?.toLowerCase()
        return !ext || !allowedExtensions.includes(ext)
      })

      l.info({
        key: 'sandbox:get_files:filtering_results',
        totalFiles: allFiles.length,
        includedFiles: fileList.length,
        filteredOutFiles: filteredOut.length,
        allowedExtensions,
        sampleFilteredOut: filteredOut.slice(0, 10),
        userId: session.user.id,
      })

      // Read content of each file (limit to reasonable sizes)
      const filesContent: Record<string, string> = {}
      const tooLargeFiles: string[] = []
      const unreadableFiles: string[] = []

      for (const filePath of fileList) {
        try {
          // Read file content directly (provider handles size limits internally)
          const fullPath = filePath.startsWith('/') ? filePath : `/home/user/app/${filePath}`
          const content = await provider.readFile(fullPath)

          // Only store files smaller than 50KB
          if (content.length < 50000) {
            // Convert to relative path
            const relativePath = filePath.replace(/^\/home\/user\/app\//, '').replace(/^\.\//, '')
            filesContent[relativePath] = content
          } else {
            tooLargeFiles.push(filePath)
          }
        } catch (error) {
          l.warn({ key: 'sandbox:get_files:read_error', filePath, error, userId: session.user.id })
          unreadableFiles.push(filePath)
          continue
        }
      }

      // Log final results
      l.info({
        key: 'sandbox:get_files:final_results',
        totalFilesFound: allFiles.length,
        afterExtensionFilter: fileList.length,
        finalIncluded: Object.keys(filesContent).length,
        tooLargeFiles: tooLargeFiles.length,
        unreadableFiles: unreadableFiles.length,
        sampleTooLarge: tooLargeFiles.slice(0, 5),
        sampleUnreadable: unreadableFiles.slice(0, 5),
        userId: session.user.id,
      })

      // Build directory structure from file paths
      const directories = new Set<string>()
      for (const filePath of fileList) {
        const relativePath = filePath.replace(/^\/home\/user\/app\//, '').replace(/^\.\//, '')
        const pathParts = relativePath.split('/')
        for (let i = 1; i <= pathParts.length; i++) {
          const dirPath = pathParts.slice(0, i - 1).join('/')
          if (dirPath && !dirPath.includes('node_modules') && !dirPath.includes('.git')) {
            directories.add(dirPath)
          }
        }
      }

      const structure = Array.from(directories)
        .sort()
        .slice(0, 50) // Limit to 50 directories
        .join('\n')

      // Build enhanced file manifest
      const fileManifest: FileManifest = {
        files: {},
        routes: [],
        componentTree: {},
        entryPoint: '',
        styleFiles: [],
        timestamp: Date.now(),
      }

      // Process each file
      for (const [relativePath, content] of Object.entries(filesContent)) {
        const fullPath = `/${relativePath}`

        // Create base file info
        const fileInfo: FileInfo = {
          content: content,
          type: 'utility',
          path: fullPath,
          relativePath,
          lastModified: Date.now(),
        }

        // Parse JavaScript/JSX files
        if (relativePath.match(/\.(jsx?|tsx?)$/)) {
          const parseResult = parseTypeScriptFile(content, fullPath)
          Object.assign(fileInfo, parseResult)

          // Identify entry point
          if (relativePath === 'src/main.jsx' || relativePath === 'src/index.jsx') {
            fileManifest.entryPoint = fullPath
          }

          // Identify App.jsx
          if (relativePath === 'src/App.jsx' || relativePath === 'App.jsx') {
            fileManifest.entryPoint = fileManifest.entryPoint || fullPath
          }
        }

        // Track style files
        if (relativePath.endsWith('.css')) {
          fileManifest.styleFiles.push(fullPath)
          fileInfo.type = 'style'
        }

        fileManifest.files[fullPath] = fileInfo
      }

      // Build component tree
      fileManifest.componentTree = buildComponentTree(fileManifest.files)

      // Extract routes
      fileManifest.routes = extractRoutes(fileManifest.files)

      return {
        success: true as const,
        files: filesContent,
        structure,
        fileCount: Object.keys(filesContent).length,
        manifest: fileManifest,
      }
    } catch (error) {
      l.error({ key: 'sandbox:get_files:error', error, userId: session.user.id })
      return {
        success: false as const,
        serverError: error instanceof Error ? error.message : 'Failed to get sandbox files',
      }
    }
  })
