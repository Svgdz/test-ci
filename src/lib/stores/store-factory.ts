import { atom, map, type MapStore, type ReadableAtom, type WritableAtom } from 'nanostores'
import { PreviewStore } from './preview'
import { FilesStore, type FileMap } from './files'
import { EditorStore } from './editor'
import type {
  EditorDocument,
  ScrollPosition,
} from '@/components/editor/codemirror/CodeMirrorEditor'
import { l } from '@/lib/clients/logger'
// ActionRunner removed - was unused

export interface ArtifactState {
  id: string
  title: string
  closed: boolean
  // runner property removed - ActionRunner was unused
}

export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>

type Artifacts = MapStore<Record<string, ArtifactState>>

export type WorkbenchViewType = 'code' | 'preview' | 'settings'

/**
 * StoreFactory that also serves as the main workbench store
 * Combines factory pattern with workbench functionality
 */
export class StoreFactory {
  private static instance: StoreFactory

  // Store caches for factory pattern
  private previewStores = new Map<string, PreviewStore>()
  private filesStores = new Map<string, FilesStore>()
  private editorStores = new Map<string, EditorStore>()

  // Core workbench stores (default instances)
  #previewStore: PreviewStore
  #filesStore: FilesStore
  #editorStore: EditorStore

  // Workbench state
  artifacts: Artifacts = map({})
  showWorkbench: WritableAtom<boolean> = atom(false)
  currentView: WritableAtom<WorkbenchViewType> = atom('code')
  unsavedFiles: WritableAtom<Set<string>> = atom(new Set<string>())
  modifiedFiles = new Set<string>()
  artifactIdList: string[] = []

  private constructor() {
    l.info({ key: 'store_factory:initialized' }, 'StoreFactory initialized')

    // Initialize default stores for workbench functionality
    this.#filesStore = this.createFilesStore('default')
    this.#editorStore = this.createEditorStore(this.#filesStore, 'default')
    this.#previewStore = this.createPreviewStore('default')
  }

  static getInstance(): StoreFactory {
    if (!StoreFactory.instance) {
      StoreFactory.instance = new StoreFactory()
    }
    return StoreFactory.instance
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create or get cached PreviewStore
   */
  createPreviewStore(key?: string, sandboxId?: string): PreviewStore {
    const storeKey = key || 'default'

    if (this.previewStores.has(storeKey)) {
      const store = this.previewStores.get(storeKey)!
      if (sandboxId) {
        store.setSandboxId(sandboxId)
      }
      l.debug(
        { key: 'store_factory:reusing_preview_store', store_key: storeKey },
        `Reusing existing PreviewStore: ${storeKey}`
      )
      return store
    }

    l.debug(
      { key: 'store_factory:creating_preview_store', store_key: storeKey },
      `Creating new PreviewStore: ${storeKey}`
    )
    const store = new PreviewStore(sandboxId)
    this.previewStores.set(storeKey, store)
    return store
  }

  /**
   * Create or get cached FilesStore
   */
  createFilesStore(key?: string, sandboxId?: string): FilesStore {
    const storeKey = key || 'default'

    if (this.filesStores.has(storeKey)) {
      const store = this.filesStores.get(storeKey)!
      if (sandboxId) {
        store.setSandboxId(sandboxId)
      }
      l.debug(
        { key: 'store_factory:reusing_files_store', store_key: storeKey },
        `Reusing existing FilesStore: ${storeKey}`
      )
      return store
    }

    l.debug(
      { key: 'store_factory:creating_files_store', store_key: storeKey },
      `Creating new FilesStore: ${storeKey}`
    )
    const store = new FilesStore(sandboxId)
    this.filesStores.set(storeKey, store)
    return store
  }

  /**
   * Create or get cached EditorStore
   */
  createEditorStore(filesStore: FilesStore, key?: string): EditorStore {
    const storeKey = key || 'default'

    if (this.editorStores.has(storeKey)) {
      l.debug(
        { key: 'store_factory:reusing_editor_store', store_key: storeKey },
        `Reusing existing EditorStore: ${storeKey}`
      )
      return this.editorStores.get(storeKey)!
    }

    l.debug(
      { key: 'store_factory:creating_editor_store', store_key: storeKey },
      `Creating new EditorStore: ${storeKey}`
    )
    const store = new EditorStore(filesStore)
    this.editorStores.set(storeKey, store)
    return store
  }

  /**
   * Create a complete store set for a sandbox
   */
  createStoreSet(key?: string): {
    previewStore: PreviewStore
    filesStore: FilesStore
    editorStore: EditorStore
  } {
    const storeKey = key || 'default'

    l.info(
      { key: 'store_factory:creating_store_set', store_key: storeKey },
      `Creating complete store set: ${storeKey}`
    )

    const filesStore = this.createFilesStore(storeKey)
    const editorStore = this.createEditorStore(filesStore, storeKey)
    const previewStore = this.createPreviewStore(storeKey)

    return {
      previewStore,
      filesStore,
      editorStore,
    }
  }

  /**
   * Clear cached stores for a specific key
   */
  clearStores(key: string): void {
    this.previewStores.delete(key)
    this.filesStores.delete(key)
    this.editorStores.delete(key)
    l.info(
      { key: 'store_factory:cleared_stores', store_key: key },
      `Cleared stores for key: ${key}`
    )
  }

  /**
   * Clear all cached stores
   */
  clearAllStores(): void {
    this.previewStores.clear()
    this.filesStores.clear()
    this.editorStores.clear()
    l.info({ key: 'store_factory:all_stores_cleared' }, 'All stores cleared')
  }

  /**
   * Get store counts for monitoring
   */
  getStoreCounts(): {
    preview: number
    files: number
    editor: number
  } {
    return {
      preview: this.previewStores.size,
      files: this.filesStores.size,
      editor: this.editorStores.size,
    }
  }

  // ============================================================================
  // WORKBENCH FUNCTIONALITY
  // ============================================================================

  get previews() {
    return this.#previewStore.previews
  }

  get files() {
    return this.#filesStore.files
  }

  get currentDocument(): ReadableAtom<EditorDocument | undefined> {
    return this.#editorStore.currentDocument
  }

  get selectedFile(): ReadableAtom<string | undefined> {
    return this.#editorStore.selectedFile
  }

  get firstArtifact(): ArtifactState | undefined {
    return this.#getArtifact(this.artifactIdList[0])
  }

  get filesCount(): number {
    return this.#filesStore.filesCount
  }

  setDocuments(files: FileMap) {
    this.#editorStore.setDocuments(files)

    if (this.#filesStore.filesCount > 0 && this.currentDocument.get() === undefined) {
      // Find the first file and select it
      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent?.type === 'file') {
          this.setSelectedFile(filePath)
          break
        }
      }
    }
  }

  setShowWorkbench(show: boolean) {
    this.showWorkbench.set(show)
  }

  setCurrentDocumentContent(newContent: string) {
    const filePath = this.currentDocument.get()?.filePath

    if (!filePath) {
      return
    }

    const originalContent = this.#filesStore.getFile(filePath)?.content
    const unsavedChanges = originalContent !== undefined && originalContent !== newContent

    this.#editorStore.updateFile(filePath, newContent)

    const currentDocument = this.currentDocument.get()

    if (currentDocument) {
      const previousUnsavedFiles = this.unsavedFiles.get()

      if (unsavedChanges && previousUnsavedFiles.has(currentDocument.filePath)) {
        return
      }

      const newUnsavedFiles = new Set(previousUnsavedFiles)

      if (unsavedChanges) {
        newUnsavedFiles.add(currentDocument.filePath)
      } else {
        newUnsavedFiles.delete(currentDocument.filePath)
      }

      this.unsavedFiles.set(newUnsavedFiles)
    }
  }

  setCurrentDocumentScrollPosition(position: ScrollPosition) {
    const editorDocument = this.currentDocument.get()

    if (!editorDocument) {
      return
    }

    const { filePath } = editorDocument
    this.#editorStore.updateScrollPosition(filePath, position)
  }

  setSelectedFile(filePath: string | undefined) {
    this.#editorStore.setSelectedFile(filePath)
  }

  markFileAsSaved(filePath: string) {
    const newUnsavedFiles = new Set(this.unsavedFiles.get())
    newUnsavedFiles.delete(filePath)
    this.unsavedFiles.set(newUnsavedFiles)
    l.debug(`StoreFactory: Marked file as saved: ${filePath}`)
  }

  markCurrentDocumentAsSaved() {
    const currentDocument = this.currentDocument.get()

    if (currentDocument === undefined) {
      return
    }

    this.markFileAsSaved(currentDocument.filePath)
  }

  resetCurrentDocument() {
    const currentDocument = this.currentDocument.get()

    if (currentDocument === undefined) {
      return
    }

    const { filePath } = currentDocument
    const file = this.#filesStore.getFile(filePath)

    if (!file) {
      return
    }

    this.setCurrentDocumentContent(file.content)
  }

  markAllFilesAsSaved() {
    this.unsavedFiles.set(new Set<string>())
    l.debug('StoreFactory: Marked all files as saved')
  }

  getFileModifications() {
    return this.#filesStore.getFileModifications()
  }

  resetAllFileModifications() {
    this.#filesStore.resetFileModifications()
  }

  abortAllActions() {
    // TODO: Implement action abortion logic
    l.warn('StoreFactory: abortAllActions called - implementation pending')
  }

  addArtifact({ messageId, title, id }: { messageId: string; title: string; id: string }) {
    const artifact = this.#getArtifact(messageId)

    if (artifact) {
      return
    }

    if (!this.artifactIdList.includes(messageId)) {
      this.artifactIdList.push(messageId)
    }

    this.artifacts.setKey(messageId, {
      id,
      title,
      closed: false,
      // runner property removed - ActionRunner was unused
    })

    l.debug(`StoreFactory: Added artifact ${messageId} with title: ${title}`)
  }

  updateArtifact({ messageId }: { messageId: string }, state: Partial<ArtifactUpdateState>) {
    const artifact = this.#getArtifact(messageId)

    if (!artifact) {
      l.warn(`StoreFactory: Cannot update artifact ${messageId} - not found`)
      return
    }

    this.artifacts.setKey(messageId, { ...artifact, ...state })
    l.debug(`StoreFactory: Updated artifact ${messageId}`)
  }

  #getArtifact(id: string) {
    const artifacts = this.artifacts.get()
    return artifacts[id]
  }
}

// Export singleton instance and convenience functions
export const storeFactory = StoreFactory.getInstance()

// Export the main instance as workbenchStore for compatibility
export const workspaceStore = storeFactory

/**
 * Convenience function to create preview store
 */
export function createPreviewStore(key?: string): PreviewStore {
  return storeFactory.createPreviewStore(key)
}
