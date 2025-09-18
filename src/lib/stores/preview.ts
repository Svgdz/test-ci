import { atom } from 'nanostores'
import { l as logger } from '@/lib/clients/logger'

export interface PreviewInfo {
  port: number
  ready: boolean
  baseUrl: string
  sandboxId?: string
}

export type PreviewViewType = 'code' | 'preview'

export class PreviewStore {
  #availablePreviews = new Map<number, PreviewInfo>()

  previews = atom<PreviewInfo[]>([])
  showPreview = atom<boolean>(false)
  currentView = atom<PreviewViewType>('code')

  constructor(sandboxId?: string) {
    if (sandboxId) {
      void this.#init(sandboxId)
    }
  }

  async #init(sandboxId: string) {
    // Initialize with placeholder - actual URL will be set by server
    const previewInfo: PreviewInfo = {
      port: 3000,
      ready: false,
      baseUrl: '',
      sandboxId,
    }

    this.#availablePreviews.set(3000, previewInfo)
    this.previews.set([previewInfo])

    logger.info(
      { key: 'preview_store:initialized', sandbox_id: sandboxId },
      `Preview store initialized for sandbox: ${sandboxId}`
    )
  }

  // Method to manually add a preview (useful for multiple services)
  addPreview(port: number, baseUrl: string, sandboxId?: string) {
    const previewInfo: PreviewInfo = {
      port,
      ready: true,
      baseUrl,
      sandboxId,
    }

    console.log('PreviewStore.addPreview called with:', { port, baseUrl, sandboxId })
    console.log('PreviewStore instance:', this)

    this.#availablePreviews.set(port, previewInfo)

    // Replace existing preview with same port or add new one
    const currentPreviews = this.previews.get()
    const existingIndex = currentPreviews.findIndex((p) => p.port === port)

    let newPreviews: PreviewInfo[]
    if (existingIndex >= 0) {
      // Replace existing preview
      newPreviews = [...currentPreviews]
      newPreviews[existingIndex] = previewInfo
      console.log('PreviewStore: Replacing existing preview at index', existingIndex)
    } else {
      // Add new preview
      newPreviews = [...currentPreviews, previewInfo]
      console.log('PreviewStore: Adding new preview')
    }

    this.previews.set(newPreviews)

    console.log('PreviewStore.addPreview completed. New previews:', this.previews.get())

    logger.info(
      {
        key: 'preview_store:preview_added',
        port,
        baseUrl,
        sandboxId,
        totalPreviews: this.previews.get().length,
        wasReplacement: existingIndex >= 0,
      },
      `Preview ${existingIndex >= 0 ? 'updated' : 'added'}: ${baseUrl}`
    )
  }

  // Method to remove a preview
  removePreview(port: number) {
    this.#availablePreviews.delete(port)
    this.previews.set(this.previews.get().filter((preview) => preview.port !== port))
  }

  // Get the main sandbox URL
  getMainPreview(): PreviewInfo | undefined {
    return this.previews.get()[0]
  }

  // Update sandbox ID and reinitialize
  setSandboxId(sandboxId: string) {
    void this.#init(sandboxId)
  }

  setShowPreview(show: boolean) {
    this.showPreview.set(show)
  }

  setCurrentView(view: PreviewViewType) {
    this.currentView.set(view)
  }
}

// Export a factory function for creating preview stores
export function createPreviewStore(sandboxId?: string) {
  return new PreviewStore(sandboxId)
}
