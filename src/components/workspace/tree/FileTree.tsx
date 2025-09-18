/* eslint-disable @typescript-eslint/no-use-before-define */
import { memo, useEffect, useMemo, useState, useRef, type ReactNode } from 'react'
import type { FileMap } from '@/lib/stores/files'
import { cn } from '@/lib/utils'
import { l } from '@/lib/clients/logger'
import { ChevronRight, File as FileIcon } from 'lucide-react'
import { useWorkspace } from '../context/WorkspaceProvider'

interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onNewFile: () => void
  onNewFolder: () => void
  onRename?: () => void
  onDelete?: () => void
  target?: {
    path: string
    type: 'file' | 'folder'
  }
}

function ContextMenu({
  x,
  y,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  target,
}: ContextMenuProps) {
  useEffect(() => {
    const handleClick = () => onClose()
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      className='fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg py-1 z-50 min-w-[150px]'
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className='w-full text-left px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2'
        onClick={() => {
          onNewFile()
          onClose()
        }}
      >
        New File
      </button>
      <button
        className='w-full text-left px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2'
        onClick={() => {
          onNewFolder()
          onClose()
        }}
      >
        New Folder
      </button>
      {target && (
        <>
          <hr className='border-gray-200 dark:border-gray-600 my-1' />
          {onRename && (
            <button
              className='w-full text-left px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2'
              onClick={() => {
                onRename()
                onClose()
              }}
            >
              Rename
            </button>
          )}
          {onDelete && (
            <button
              className='w-full text-left px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 flex items-center gap-2'
              onClick={() => {
                onDelete()
                onClose()
              }}
            >
              Delete
            </button>
          )}
        </>
      )}
    </div>
  )
}

const NODE_PADDING_LEFT = 8
// Minimal hidden files - let server-side exclusion handle performance optimization
const DEFAULT_HIDDEN_FILES = [
  /\/\.DS_Store$/, // macOS system files
  /\/Thumbs\.db$/, // Windows system files
  /\/\.tmp$/, // Temporary files
  /\/\.temp$/, // Temporary files
]

interface Props {
  files?: FileMap
  selectedFile?: string
  onFileSelect?: (filePath: string) => void
  onFileCreate?: (filePath: string, content?: string) => Promise<void>
  onFileDelete?: (filePath: string) => Promise<void>
  onFileRename?: (oldPath: string, newPath: string) => Promise<void>
  rootFolder?: string
  hideRoot?: boolean
  collapsed?: boolean
  allowFolderSelection?: boolean
  hiddenFiles?: Array<string | RegExp>
  unsavedFiles?: Set<string>
  searchQuery?: string
  className?: string
}

export const FileTree = memo(
  ({
    files: propFiles = {},
    onFileSelect: propOnFileSelect,
    onFileCreate,
    onFileDelete,
    onFileRename,
    selectedFile: propSelectedFile,
    rootFolder,
    hideRoot = false,
    collapsed = true,
    allowFolderSelection = false,
    hiddenFiles,
    className,
    unsavedFiles,
    searchQuery,
  }: Props) => {
    // Try to use workspace context, fall back to props for backward compatibility
    let workspace
    try {
      workspace = useWorkspace()
    } catch {
      // Not in workspace context, use props
      workspace = null
    }

    // Use workspace data if available, otherwise fall back to props
    // Prefer fully built recursive map from WorkspaceProvider (loadProjectFiles)
    const files =
      workspace?.fileMap && Object.keys(workspace.fileMap).length > 0
        ? workspace.fileMap
        : propFiles

    const selectedFile = workspace?.selectedFile ?? propSelectedFile
    const onFileSelect = workspace
      ? (filePath: string) => workspace.setSelectedFile(filePath)
      : propOnFileSelect
    // Reduce excessive logging that causes re-render loops
    const fileCount = Object.keys(files).length
    const renderCountRef = useRef(0)
    renderCountRef.current++

    // Only log every 10th render or when file count changes significantly
    const prevFileCountRef = useRef(fileCount)
    if (renderCountRef.current % 10 === 0 || Math.abs(fileCount - prevFileCountRef.current) > 5) {
      l.debug({ fileCount, selectedFile, renderCount: renderCountRef.current }, 'FileTree render')
      prevFileCountRef.current = fileCount
    }

    const computedHiddenFiles = useMemo(
      () => [...DEFAULT_HIDDEN_FILES, ...(hiddenFiles ?? [])],
      [hiddenFiles]
    )

    const fileList = useMemo(() => {
      l.info(
        {
          inputFiles: Object.keys(files).length,
          rootFolder,
          hideRoot,
          inputFileTypes: Object.entries(files).map(([path, data]) => ({ path, type: data?.type })),
          sampleInputEntries: Object.entries(files)
            .slice(0, 5)
            .map(([path, data]) => ({
              path,
              type: data?.type,
              isFolder: data?.type === 'folder',
              isFile: data?.type === 'file',
              fullData: data,
            })),
        },
        'FileTree buildFileList input'
      )

      const list = buildFileList(files, hideRoot, computedHiddenFiles, rootFolder)

      // Debug logging to understand what's happening
      l.info(
        {
          inputFiles: Object.keys(files).length,
          outputList: list.length,
          firstFewListItems: list.slice(0, 10).map((item) => ({
            kind: item.kind,
            name: item.name,
            fullPath: item.fullPath,
            depth: item.depth,
          })),
          allFolders: list
            .filter((item) => item.kind === 'folder')
            .map((item) => ({ name: item.name, fullPath: item.fullPath, depth: item.depth })),
          allFiles: list
            .filter((item) => item.kind === 'file')
            .map((item) => ({ name: item.name, fullPath: item.fullPath, depth: item.depth })),
        },
        'FileTree buildFileList result'
      )
      return list
    }, [files, rootFolder, hideRoot, computedHiddenFiles])

    const [collapsedFolders, setCollapsedFolders] = useState(() => {
      try {
        return collapsed
          ? new Set(
              fileList.filter((item) => item && item.kind === 'folder').map((item) => item.fullPath)
            )
          : new Set<string>()
      } catch (error) {
        l.error(
          { key: 'filetree:collapsed_folders_init_error', error },
          'Error initializing collapsed folders'
        )
        return new Set<string>()
      }
    })

    const [contextMenu, setContextMenu] = useState<{
      x: number
      y: number
      target?: { path: string; type: 'file' | 'folder' }
    } | null>(null)

    // const [editingItem, setEditingItem] = useState<{
    //   path: string;
    //   type: 'rename' | 'create';
    //   originalName?: string;
    // } | null>(null);

    useEffect(() => {
      if (collapsed) {
        setCollapsedFolders(
          new Set(fileList.filter((item) => item.kind === 'folder').map((item) => item.fullPath))
        )
        return
      }

      setCollapsedFolders((prevCollapsed) => {
        const newCollapsed = new Set<string>()

        for (const folder of fileList) {
          if (folder.kind === 'folder' && prevCollapsed.has(folder.fullPath)) {
            newCollapsed.add(folder.fullPath)
          }
        }

        return newCollapsed
      })
    }, [fileList, collapsed])

    const filteredFileList = useMemo(() => {
      let list = []

      let lastDepth = Number.MAX_SAFE_INTEGER

      for (const fileOrFolder of fileList) {
        const depth = fileOrFolder.depth

        // if the depth is equal we reached the end of the collapsed group
        if (lastDepth === depth) {
          lastDepth = Number.MAX_SAFE_INTEGER
        }

        // ignore collapsed folders
        if (collapsedFolders.has(fileOrFolder.fullPath)) {
          lastDepth = Math.min(lastDepth, depth)
        }

        // ignore files and folders below the last collapsed folder
        if (lastDepth < depth) {
          continue
        }

        list.push(fileOrFolder)
      }

      // Apply search filter if query exists
      if (searchQuery && searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        list = list.filter(
          (item) =>
            item.name.toLowerCase().includes(query) || item.fullPath.toLowerCase().includes(query)
        )
      }

      return list
    }, [fileList, collapsedFolders, searchQuery])

    // Remove this logging as it causes re-render loops
    // Use debug logging with count instead
    const prevFilteredCountRef = useRef(0)
    if (filteredFileList.length !== prevFilteredCountRef.current) {
      l.debug(`Filtered file list updated: ${filteredFileList.length} items`)
      prevFilteredCountRef.current = filteredFileList.length
    }

    const toggleCollapseState = (fullPath: string) => {
      setCollapsedFolders((prevSet) => {
        const newSet = new Set(prevSet)

        if (newSet.has(fullPath)) {
          newSet.delete(fullPath)
        } else {
          newSet.add(fullPath)
        }

        return newSet
      })
    }

    const handleContextMenu = (
      e: React.MouseEvent,
      target?: { path: string; type: 'file' | 'folder' }
    ) => {
      e.preventDefault()
      e.stopPropagation()

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        target,
      })
    }

    const handleNewFile = async (basePath?: string) => {
      const fileName = prompt('Enter file name:')
      if (!fileName) return

      const fullPath = basePath ? `${basePath}/${fileName}` : fileName

      try {
        if (onFileCreate) {
          await onFileCreate(fullPath, '// New file\n')
          l.info(
            { key: 'filetree:file_created', file_path: fullPath },
            `Created new file: ${fullPath}`
          )
        }
      } catch (error) {
        l.error({ key: 'filetree:file_create_error', error }, 'Failed to create file')
        alert('Failed to create file. Check console for details.')
      }
    }

    const handleNewFolder = async (basePath?: string) => {
      const folderName = prompt('Enter folder name:')
      if (!folderName) return

      const fullPath = basePath ? `${basePath}/${folderName}` : folderName

      try {
        // Create a placeholder file in the folder to ensure it exists
        const placeholderPath = `${fullPath}/.gitkeep`
        if (onFileCreate) {
          await onFileCreate(placeholderPath, '')
          l.info(
            { key: 'filetree:folder_created', folder_path: fullPath },
            `Created new folder: ${fullPath}`
          )
        }
      } catch (error) {
        l.error({ key: 'filetree:folder_create_error', error }, 'Failed to create folder')
        alert('Failed to create folder. Check console for details.')
      }
    }

    const handleRename = async (oldPath: string) => {
      const fileName = oldPath.split('/').pop() || ''
      const newName = prompt('Enter new name:', fileName)
      if (!newName || newName === fileName) return

      const newPath = oldPath.replace(fileName, newName)

      try {
        if (onFileRename) {
          await onFileRename(oldPath, newPath)
          l.info(
            { key: 'filetree:item_renamed', old_path: oldPath, new_path: newPath },
            `Renamed ${oldPath} to ${newPath}`
          )
        }
      } catch (error) {
        l.error({ key: 'filetree:rename_error', error }, 'Failed to rename')
        alert('Failed to rename. Check console for details.')
      }
    }

    const handleDelete = async (filePath: string) => {
      if (!confirm(`Are you sure you want to delete ${filePath}?`)) return

      try {
        if (onFileDelete) {
          await onFileDelete(filePath)
          l.info({ key: 'filetree:item_deleted', file_path: filePath }, `Deleted: ${filePath}`)
        }
      } catch (error) {
        l.error({ key: 'filetree:delete_error', error }, 'Failed to delete')
        alert('Failed to delete. Check console for details.')
      }
    }

    return (
      <div className={cn('text-sm', className)} onContextMenu={(e) => handleContextMenu(e)}>
        {filteredFileList.map((fileOrFolder) => {
          if (!fileOrFolder || !fileOrFolder.kind) {
            l.warn(
              { key: 'filetree:invalid_file_object', file_or_folder: fileOrFolder },
              'Invalid file/folder object'
            )
            return null
          }

          switch (fileOrFolder.kind) {
            case 'file': {
              return (
                <File
                  key={fileOrFolder.id}
                  selected={selectedFile === fileOrFolder.fullPath}
                  file={fileOrFolder}
                  unsavedChanges={unsavedFiles?.has(fileOrFolder.fullPath)}
                  onClick={() => {
                    onFileSelect?.(fileOrFolder.fullPath)
                  }}
                  onContextMenu={(e) =>
                    handleContextMenu(e, { path: fileOrFolder.fullPath, type: 'file' })
                  }
                />
              )
            }
            case 'folder': {
              return (
                <Folder
                  key={fileOrFolder.id}
                  folder={fileOrFolder}
                  selected={allowFolderSelection && selectedFile === fileOrFolder.fullPath}
                  collapsed={collapsedFolders.has(fileOrFolder.fullPath)}
                  onClick={() => {
                    toggleCollapseState(fileOrFolder.fullPath)
                  }}
                  onContextMenu={(e) =>
                    handleContextMenu(e, { path: fileOrFolder.fullPath, type: 'folder' })
                  }
                />
              )
            }
            default: {
              return undefined
            }
          }
        })}

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            target={contextMenu.target}
            onClose={() => setContextMenu(null)}
            onNewFile={() => void handleNewFile(contextMenu.target?.path)}
            onNewFolder={() => void handleNewFolder(contextMenu.target?.path)}
            onRename={
              contextMenu.target ? () => void handleRename(contextMenu.target!.path) : undefined
            }
            onDelete={
              contextMenu.target ? () => void handleDelete(contextMenu.target!.path) : undefined
            }
          />
        )}
      </div>
    )
  }
)

FileTree.displayName = 'FileTree'

export default FileTree

interface FolderProps {
  folder: FolderNode
  collapsed: boolean
  selected?: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function Folder({
  folder: { depth, name },
  collapsed,
  selected = false,
  onClick,
  onContextMenu,
}: FolderProps) {
  return (
    <NodeButton
      className={cn('group', {
        'bg-transparent text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800':
          !selected,
        'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100': selected,
      })}
      depth={depth}
      iconClasses='text-gray-500'
      onClick={onClick}
      onContextMenu={onContextMenu}
      isFolder={true}
      isExpanded={!collapsed}
    >
      {name}
    </NodeButton>
  )
}

interface FileProps {
  file: FileNode
  selected: boolean
  unsavedChanges?: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function File({
  file: { depth, name },
  onClick,
  selected,
  unsavedChanges = false,
  onContextMenu,
}: FileProps) {
  return (
    <NodeButton
      className={cn('group', {
        'bg-transparent hover:bg-gray-100 text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800':
          !selected,
        'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100': selected,
      })}
      depth={depth}
      iconClasses={cn('text-gray-500', {
        'group-hover:text-gray-900 dark:group-hover:text-white': !selected,
      })}
      onClick={onClick}
      onContextMenu={onContextMenu}
      isFolder={false}
      isExpanded={false}
    >
      <div
        className={cn('flex items-center', {
          'group-hover:text-gray-900 dark:group-hover:text-white': !selected,
        })}
      >
        <div className='flex-1 truncate pr-2'>{name}</div>
        {unsavedChanges && <span className='w-2 h-2 bg-orange-500 rounded-full shrink-0' />}
      </div>
    </NodeButton>
  )
}

interface ButtonProps {
  depth: number
  iconClasses: string
  children: ReactNode
  className?: string
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  isFolder?: boolean
  isExpanded?: boolean
}

function NodeButton({
  depth,
  iconClasses,
  onClick,
  onContextMenu,
  className,
  children,
  isFolder,
  isExpanded,
}: ButtonProps) {
  return (
    <button
      className={cn(
        'flex items-center gap-1.5 w-full pr-2 border-2 border-transparent text-left py-0.5 rounded-sm transition-colors',
        className
      )}
      style={{ paddingLeft: `${6 + depth * NODE_PADDING_LEFT}px` }}
      onClick={() => onClick?.()}
      onContextMenu={onContextMenu}
    >
      <div className={cn('shrink-0 transition-transform', iconClasses)}>
        {isFolder ? (
          <ChevronRight
            size={14}
            className={cn('transition-transform', {
              'rotate-90': isExpanded,
              'rotate-0': !isExpanded,
            })}
          />
        ) : (
          <FileIcon size={14} />
        )}
      </div>
      <div className='truncate w-full text-left'>{children}</div>
    </button>
  )
}

type Node = FileNode | FolderNode

interface BaseNode {
  id: number
  depth: number
  name: string
  fullPath: string
}

interface FileNode extends BaseNode {
  kind: 'file'
}

interface FolderNode extends BaseNode {
  kind: 'folder'
}

function buildFileList(
  files: FileMap,
  hideRoot: boolean,
  hiddenFiles: Array<string | RegExp>,
  rootFolder = '/'
): Node[] {
  const filesCount = Object.keys(files).length
  l.info(
    {
      rootFolder,
      hideRoot,
      filesCount,
      samplePaths: Object.keys(files).slice(0, 5),
    },
    'buildFileList called'
  )
  const folderPaths = new Set<string>()
  const fileList: Node[] = []

  // Safety check for null/undefined files
  if (!files || typeof files !== 'object') {
    l.warn(
      { key: 'filetree:invalid_files_object', files },
      'buildFileList received invalid files object'
    )
    return []
  }

  let defaultDepth = 0

  if (rootFolder === '/' && !hideRoot) {
    defaultDepth = 1
    fileList.push({ kind: 'folder', name: '/', depth: 0, id: 0, fullPath: '/' })
  }

  // Calculate depth adjustment for non-root folders
  const rootSegments = rootFolder.split('/').filter((segment) => segment)
  const rootDepthAdjustment = hideRoot ? -rootSegments.length + 1 : -rootSegments.length + 1

  for (const [filePath, dirent] of Object.entries(files)) {
    const segments = filePath.split('/').filter((segment) => segment)
    const fileName = segments.at(-1)

    if (!fileName || isHiddenFile(filePath, fileName, hiddenFiles)) {
      continue
    }

    l.debug(
      {
        filePath,
        direntType: dirent?.type,
        segments,
        rootFolder,
        hideRoot,
      },
      'buildFileList processing'
    )

    let currentPath = ''

    let i = 0
    let depth = 0

    while (i < segments.length) {
      const name = segments[i]
      const fullPath = (currentPath += `/${name}`)

      l.debug(
        {
          name,
          fullPath,
          rootFolder,
          startsWithRoot: fullPath.startsWith(rootFolder),
          isRootAndHidden: hideRoot && fullPath === rootFolder,
          shouldSkip: !fullPath.startsWith(rootFolder) || (hideRoot && fullPath === rootFolder),
        },
        'buildFileList path check'
      )

      if (!fullPath.startsWith(rootFolder) || (hideRoot && fullPath === rootFolder)) {
        i++
        continue
      }

      if (i === segments.length - 1 && dirent?.type === 'file') {
        l.debug(
          {
            name,
            fullPath,
            direntType: dirent?.type,
            depth: depth + defaultDepth + rootDepthAdjustment,
          },
          'buildFileList adding file'
        )
        fileList.push({
          kind: 'file',
          id: fileList.length,
          name,
          fullPath,
          depth: depth + defaultDepth + rootDepthAdjustment,
        })
      } else if (i === segments.length - 1 && dirent?.type === 'folder') {
        // Handle explicitly defined directories
        if (!folderPaths.has(fullPath)) {
          l.debug(
            {
              name,
              fullPath,
              depth: depth + defaultDepth + rootDepthAdjustment,
            },
            'buildFileList adding explicit folder'
          )
          folderPaths.add(fullPath)
          fileList.push({
            kind: 'folder',
            id: fileList.length,
            name,
            fullPath,
            depth: depth + defaultDepth + rootDepthAdjustment,
          })
        }
      } else if (!folderPaths.has(fullPath)) {
        // Handle intermediate directories
        l.debug(
          {
            name,
            fullPath,
            depth: depth + defaultDepth + rootDepthAdjustment,
          },
          'buildFileList adding intermediate folder'
        )
        folderPaths.add(fullPath)
        fileList.push({
          kind: 'folder',
          id: fileList.length,
          name,
          fullPath,
          depth: depth + defaultDepth + rootDepthAdjustment,
        })
      }

      i++
      depth++
    }
  }

  return sortFileList(rootFolder, fileList, hideRoot)
}

function isHiddenFile(filePath: string, fileName: string, hiddenFiles: Array<string | RegExp>) {
  // Only hide system files - let server handle performance exclusions
  const systemFiles = ['.DS_Store', 'Thumbs.db', '.tmp', '.temp']

  if (systemFiles.includes(fileName)) {
    return true
  }

  return hiddenFiles.some((pathOrRegex) => {
    if (typeof pathOrRegex === 'string') {
      return fileName === pathOrRegex
    }

    return pathOrRegex.test(filePath)
  })
}

/**
 * Sorts the given list of nodes into a tree structure (still a flat list).
 *
 * This function organizes the nodes into a hierarchical structure based on their paths,
 * with folders appearing before files and all items sorted alphabetically within their level.
 *
 * @note This function mutates the given `nodeList` array for performance reasons.
 *
 * @param rootFolder - The path of the root folder to start the sorting from.
 * @param nodeList - The list of nodes to be sorted.
 *
 * @returns A new array of nodes sorted in depth-first order.
 */
function sortFileList(rootFolder: string, nodeList: Node[], hideRoot: boolean): Node[] {
  l.debug({}, 'sortFileList')

  const nodeMap = new Map<string, Node>()
  const childrenMap = new Map<string, Node[]>()

  // pre-sort nodes by name and type
  nodeList.sort((a, b) => compareNodes(a, b))

  for (const node of nodeList) {
    nodeMap.set(node.fullPath, node)

    const parentPath = node.fullPath.slice(0, node.fullPath.lastIndexOf('/'))

    if (parentPath !== rootFolder.slice(0, rootFolder.lastIndexOf('/'))) {
      if (!childrenMap.has(parentPath)) {
        childrenMap.set(parentPath, [])
      }

      childrenMap.get(parentPath)?.push(node)
    }
  }

  const sortedList: Node[] = []

  const depthFirstTraversal = (path: string): void => {
    const node = nodeMap.get(path)

    if (node) {
      sortedList.push(node)
    }

    const children = childrenMap.get(path)

    if (children) {
      for (const child of children) {
        if (child.kind === 'folder') {
          depthFirstTraversal(child.fullPath)
        } else {
          sortedList.push(child)
        }
      }
    }
  }

  if (hideRoot) {
    // if root is hidden, start traversal from its immediate children
    const rootChildren = childrenMap.get(rootFolder) || []

    for (const child of rootChildren) {
      depthFirstTraversal(child.fullPath)
    }
  } else {
    depthFirstTraversal(rootFolder)
  }

  return sortedList
}

function compareNodes(a: Node, b: Node): number {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1
  }

  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}
