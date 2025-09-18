import { map, type MapStore } from 'nanostores'
import { l as logger } from '@/lib/clients/logger'
import { fileEvents } from './events'

export interface File {
  type: 'file'
  content: string
  isBinary: boolean
  isExcluded?: boolean
}

export interface Folder {
  type: 'folder'
}

type Dirent = File | Folder

export type FileMap = Record<string, Dirent | undefined>

/**
 * Client-safe FilesStore following the standardized pattern
 * - Pure state management only
 * - No server action imports
 * - Synchronous operations only
 * - Server operations handled at component level
 */
export class FilesStore {
  #sandboxId: string | null = null

  /**
   * Tracks the number of files without folders.
   */
  #size = 0

  /**
   * @note Keeps track all modified files with their original content since the last user message.
   * Needs to be reset when the user sends another message and all changes have been submitted
   * for the model to be aware of the changes.
   */
  #modifiedFiles: Map<string, string> = new Map()

  /**
   * Map of files that matches the state of E2B sandbox.
   */
  files: MapStore<FileMap> = map({})

  get filesCount() {
    return this.#size
  }

  get sandboxId() {
    return this.#sandboxId
  }

  constructor(sandboxId?: string) {
    if (sandboxId) {
      this.#sandboxId = sandboxId
    }
  }

  setSandboxId(sandboxId: string) {
    this.#sandboxId = sandboxId
    logger.info(
      { key: 'files_store:sandbox_id_set', sandbox_id: sandboxId },
      `Sandbox ID set: ${sandboxId}`
    )
  }

  getFile(filePath: string): File | undefined {
    const dirent = this.files.get()[filePath]

    if (dirent?.type !== 'file') {
      return undefined
    }

    return dirent
  }

  isFileExcluded(filePath: string): boolean {
    const file = this.getFile(filePath)
    return file?.isExcluded === true
  }

  getFileModifications() {
    const result: Record<string, { before: string; after: string }> = {}
    const currentFiles = this.files.get()

    for (const [path, originalContent] of this.#modifiedFiles.entries()) {
      const current = currentFiles[path]
      if (current && current.type === 'file') {
        result[path] = {
          before: originalContent,
          after: current.content,
        }
      }
    }

    return result
  }

  resetFileModifications() {
    this.#modifiedFiles.clear()
  }

  // Pure state management methods (synchronous only)

  /**
   * Update file content in store (local state only)
   */
  updateFile(filePath: string, content: string): void {
    const oldContent = this.getFile(filePath)?.content

    if (oldContent && !this.#modifiedFiles.has(filePath)) {
      this.#modifiedFiles.set(filePath, oldContent)
    }

    // Update the store immediately
    this.files.setKey(filePath, { type: 'file', content, isBinary: false })

    logger.info(
      { key: 'files_store:file_updated', file_path: filePath },
      `File updated: ${filePath}`
    )
    if (oldContent) {
      void fileEvents.updated(filePath, content, oldContent, 'FilesStore')
    }
  }

  /**
   * Add file to store (local state only)
   */
  addFileToStore(filePath: string, content: string = ''): void {
    const existing = this.files.get()[filePath]
    if (!existing) {
      this.#size++
    }

    this.files.setKey(filePath, {
      type: 'file',
      content,
      isBinary: false,
    })

    logger.info(
      { key: 'files_store:file_added_to_store', file_path: filePath },
      `File added to store: ${filePath}`
    )
    void fileEvents.created(filePath, content, 'FilesStore')
  }

  /**
   * Remove file from store (local state only)
   */
  removeFileFromStore(filePath: string): void {
    const currentFiles = this.files.get()
    const wasFile = currentFiles[filePath]?.type === 'file'

    this.files.setKey(filePath, undefined)

    if (wasFile) {
      this.#size--
    }

    logger.info(
      { key: 'files_store:file_removed_from_store', file_path: filePath },
      `File removed from store: ${filePath}`
    )
    void fileEvents.deleted(filePath, 'FilesStore')
  }

  /**
   * Set entire file map (bulk operation)
   */
  setFiles(fileMap: FileMap): void {
    let fileCount = 0

    for (const [, dirent] of Object.entries(fileMap)) {
      if (dirent?.type === 'file') {
        fileCount++
      }
    }

    this.files.set(fileMap)
    this.#size = fileCount

    logger.info(
      {
        key: 'files_store:bulk_files_set',
        total_entries: Object.keys(fileMap).length,
        file_count: fileCount,
      },
      `Bulk files set: ${fileCount} files, ${Object.keys(fileMap).length} total entries`
    )
  }

  /**
   * Mark file as excluded (content not loaded)
   */
  markFileExcluded(filePath: string): void {
    this.files.setKey(filePath, {
      type: 'file',
      content: '',
      isBinary: false,
      isExcluded: true,
    })
  }

  /**
   * Update file content after loading excluded file
   */
  loadExcludedFileContent(filePath: string, content: string): void {
    const file = this.getFile(filePath)
    if (!file || !file.isExcluded) {
      logger.warn(
        { key: 'files_store:file_not_excluded', file_path: filePath },
        `File is not excluded or doesn't exist: ${filePath}`
      )
      return
    }

    // Update the file in the store with content and remove excluded flag
    this.files.setKey(filePath, {
      type: 'file',
      content,
      isBinary: false,
      isExcluded: false,
    })

    logger.info(
      { key: 'files_store:loaded_excluded_file', file_path: filePath },
      `Loaded content for excluded file: ${filePath}`
    )
  }

  fileExists(filePath: string): boolean {
    const files = this.files.get()
    return files[filePath] !== undefined
  }

  readFile(filePath: string): string | undefined {
    return this.getFile(filePath)?.content
  }

  clear(): void {
    this.files.set({})
    this.#size = 0
    this.#modifiedFiles.clear()
    this.#sandboxId = null
    logger.info({ key: 'files_store:cleared' }, 'Files store cleared')
  }
}

/**
 * Helper actions for FilesStore operations
 * Following the same pattern as chatActions
 */
export const filesActions = {
  /**
   * Update file content in store
   */
  updateFile: (store: FilesStore, filePath: string, content: string) => {
    store.updateFile(filePath, content)
  },

  /**
   * Add file to store after successful server operation
   */
  addFile: (store: FilesStore, filePath: string, content: string = '') => {
    store.addFileToStore(filePath, content)
  },

  /**
   * Remove file from store after successful server operation
   */
  removeFile: (store: FilesStore, filePath: string) => {
    store.removeFileFromStore(filePath)
  },

  /**
   * Set all files (bulk operation)
   */
  setFiles: (store: FilesStore, fileMap: FileMap) => {
    store.setFiles(fileMap)
  },

  /**
   * Move file in store (rename operation)
   */
  moveFile: (store: FilesStore, oldPath: string, newPath: string) => {
    const currentFiles = store.files.get()
    const fileData = currentFiles[oldPath]

    if (fileData) {
      store.files.setKey(newPath, fileData)
      store.removeFileFromStore(oldPath)

      if (fileData.type === 'file') {
        void fileEvents.created(newPath, fileData.content, 'FilesStore')
      }
    }
  },

  /**
   * Load content for excluded file
   */
  loadExcludedFileContent: (store: FilesStore, filePath: string, content: string) => {
    store.loadExcludedFileContent(filePath, content)
  },
}
