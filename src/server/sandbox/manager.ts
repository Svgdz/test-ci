import 'server-cli-only'

import { SandboxProvider } from './types'
import { SandboxFactory } from './factory'
import { sandboxDatabaseSync } from './database-sync'

// Sandbox lifecycle constants
const SANDBOX_CONSTANTS = {
  CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
  MAX_INACTIVE_AGE: 24 * 60 * 60 * 1000, // 24 hours before termination
} as const

interface ManagedSandboxInfo {
  sandboxId: string
  provider: SandboxProvider
  createdAt: Date
  lastAccessed: Date
}

class SandboxManager {
  private sandboxes: Map<string, ManagedSandboxInfo> = new Map()
  private activeSandboxId: string | null = null
  private cleanupInterval: NodeJS.Timeout | null = null
  private creatingProjects: Set<string> = new Set()

  /**
   * Initialize database sync with Supabase client
   */
  initializeDatabaseSync(supabase: Parameters<typeof sandboxDatabaseSync.initialize>[0]): void {
    sandboxDatabaseSync.initialize(supabase)
  }

  /**
   * Create a new sandbox - this is the ONLY place sandboxes should be created
   * Returns sandbox info and registers it with the manager
   */
  async createNewSandbox(
    projectId?: string
  ): Promise<{ sandboxId: string; url: string; provider: SandboxProvider }> {
    // Prevent concurrent creation for the same project
    if (projectId && this.creatingProjects.has(projectId)) {
      console.warn(`[SandboxManager] Sandbox creation already in progress for project ${projectId}`)
      // Wait a bit and check if sandbox was created
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Check if a sandbox was created for this project
      for (const [sandboxId, info] of this.sandboxes.entries()) {
        // Check if this sandbox was created recently (within last 5 seconds)
        if (Date.now() - info.createdAt.getTime() < 5000) {
          console.log(
            `[SandboxManager] Found recently created sandbox ${sandboxId} for project ${projectId}`
          )
          // Get the URL from the provider - this will need to be implemented per provider
          // For now, construct it based on E2B format
          const url = `https://${sandboxId}-5173.e2b.dev`
          return {
            sandboxId,
            url,
            provider: info.provider,
          }
        }
      }

      throw new Error(`Sandbox creation already in progress for project ${projectId}`)
    }

    if (projectId) {
      this.creatingProjects.add(projectId)
    }

    try {
      console.log(
        `[SandboxManager] Creating new sandbox${projectId ? ` for project ${projectId}` : ''}`
      )

      // Use factory to create provider instance
      const provider = SandboxFactory.create()

      // Create the actual sandbox using betaCreate with autoPause
      const sandboxInfo = await provider.createSandbox()

      // Register with manager
      this.sandboxes.set(sandboxInfo.sandboxId, {
        sandboxId: sandboxInfo.sandboxId,
        provider,
        createdAt: new Date(),
        lastAccessed: new Date(),
      })
      this.activeSandboxId = sandboxInfo.sandboxId
      this.startCleanupIfNeeded()

      console.log(`[SandboxManager] Created and registered sandbox: ${sandboxInfo.sandboxId}`)

      return {
        sandboxId: sandboxInfo.sandboxId,
        url: sandboxInfo.url,
        provider,
      }
    } catch (error) {
      console.error('[SandboxManager] Failed to create sandbox:', error)
      throw new Error(
        `Failed to create sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    } finally {
      if (projectId) {
        this.creatingProjects.delete(projectId)
      }
    }
  }

  /**
   * Get or reconnect to an existing sandbox provider
   * This method NEVER creates new sandboxes, only reconnects to existing ones
   */
  async getOrReconnectProvider(sandboxId: string): Promise<SandboxProvider> {
    // Check if already in memory
    const existing = this.sandboxes.get(sandboxId)
    if (existing) {
      existing.lastAccessed = new Date()
      // E2B automatically handles resume if sandbox was auto-paused
      return existing.provider
    }

    // Not in memory - reconnect to existing sandbox
    console.log(`[SandboxManager] Sandbox ${sandboxId} not in memory, attempting to reconnect`)

    try {
      const provider = SandboxFactory.create()

      // Type guard for providers supporting reconnect
      const hasReconnect = (
        p: SandboxProvider
      ): p is SandboxProvider & { reconnect: (id: string) => Promise<boolean> } => {
        return typeof (p as { reconnect?: unknown }).reconnect === 'function'
      }

      if (!hasReconnect(provider)) {
        throw new Error('Provider does not support reconnection')
      }

      // Add timeout to prevent long waits during reconnection
      const reconnectPromise = provider.reconnect(sandboxId)
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Sandbox reconnection timeout')), 15000) // 15 second timeout
      })

      const reconnected = await Promise.race([reconnectPromise, timeoutPromise])

      if (!reconnected) {
        throw new Error(`Failed to reconnect - provider returned false`)
      }

      // Successfully reconnected - register with manager
      this.sandboxes.set(sandboxId, {
        sandboxId,
        provider,
        createdAt: new Date(),
        lastAccessed: new Date(),
      })
      this.activeSandboxId = sandboxId
      this.startCleanupIfNeeded()

      console.log(`[SandboxManager] Successfully reconnected to sandbox ${sandboxId}`)
      return provider
    } catch (error) {
      console.error(`[SandboxManager] Failed to reconnect to sandbox ${sandboxId}:`, error)
      throw new Error(
        `Failed to reconnect to sandbox ${sandboxId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Register a new sandbox
   */
  registerSandbox(sandboxId: string, provider: SandboxProvider): void {
    this.sandboxes.set(sandboxId, {
      sandboxId,
      provider,
      createdAt: new Date(),
      lastAccessed: new Date(),
    })
    this.activeSandboxId = sandboxId
    this.startCleanupIfNeeded()
  }

  /**
   * Get the active sandbox provider
   */
  getActiveProvider(): SandboxProvider | null {
    if (!this.activeSandboxId) return null

    const sandbox = this.sandboxes.get(this.activeSandboxId)
    if (sandbox) {
      sandbox.lastAccessed = new Date()
      return sandbox.provider
    }
    return null
  }

  /**
   * Get a specific sandbox provider
   */
  getProvider(sandboxId: string): SandboxProvider | null {
    const sandbox = this.sandboxes.get(sandboxId)
    if (sandbox) {
      sandbox.lastAccessed = new Date()
      return sandbox.provider
    }
    return null
  }

  /**
   * Set the active sandbox
   */
  setActiveSandbox(sandboxId: string): boolean {
    if (this.sandboxes.has(sandboxId)) {
      this.activeSandboxId = sandboxId
      return true
    }
    return false
  }

  /**
   * Terminate a sandbox
   */
  async terminateSandbox(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId)
    if (sandbox) {
      try {
        await sandbox.provider.terminate()

        // Sync termination to database
        await sandboxDatabaseSync.updateSandboxStatus('', sandboxId, 'terminated')
      } catch (error) {
        console.error(`[SandboxManager] Error terminating sandbox ${sandboxId}:`, error)
      }
      this.sandboxes.delete(sandboxId)

      if (this.activeSandboxId === sandboxId) {
        this.activeSandboxId = null
      }
    }
  }

  /**
   * Terminate all sandboxes
   */
  async terminateAll(): Promise<void> {
    const promises = Array.from(this.sandboxes.values()).map((sandbox) =>
      sandbox.provider
        .terminate()
        .catch((err) =>
          console.error(`[SandboxManager] Error terminating sandbox ${sandbox.sandboxId}:`, err)
        )
    )

    await Promise.all(promises)
    this.sandboxes.clear()
    this.activeSandboxId = null
  }

  /**
   * Start automatic cleanup if not already running
   */
  private startCleanupIfNeeded(): void {
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => {
        this.performLifecycleManagement().catch((error) => {
          console.error('[SandboxManager] Error in lifecycle management:', error)
        })
      }, SANDBOX_CONSTANTS.CLEANUP_INTERVAL)
    }
  }

  /**
   * Stop automatic cleanup
   */
  private stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Perform lifecycle management
   * E2B handles auto-pause automatically, we only clean up very old inactive sandboxes
   */
  private async performLifecycleManagement(): Promise<void> {
    const now = new Date()
    const toTerminate: string[] = []

    for (const [id, info] of this.sandboxes.entries()) {
      const timeSinceLastAccess = now.getTime() - info.lastAccessed.getTime()

      // E2B handles auto-pause, we only need to clean up very old inactive sandboxes
      // Terminate sandboxes that haven't been accessed in a very long time
      if (timeSinceLastAccess > SANDBOX_CONSTANTS.MAX_INACTIVE_AGE) {
        toTerminate.push(id)
        console.log(
          `[SandboxManager] Scheduling termination for sandbox ${id} - inactive for ${Math.round(timeSinceLastAccess / (24 * 60 * 60 * 1000))} days`
        )
      }
    }

    // Execute termination operations for very old sandboxes
    for (const id of toTerminate) {
      await this.terminateSandbox(id)
    }
  }

  /**
   * Get sandbox statistics
   */
  getSandboxStats(): {
    total: number
  } {
    return {
      total: this.sandboxes.size,
    }
  }

  /**
   * Clean up old sandboxes (older than maxAge milliseconds)
   */
  async cleanup(maxAge: number = 3600000): Promise<void> {
    const now = new Date()
    const toDelete: string[] = []

    for (const [id, info] of this.sandboxes.entries()) {
      const age = now.getTime() - info.lastAccessed.getTime()
      if (age > maxAge) {
        toDelete.push(id)
      }
    }

    for (const id of toDelete) {
      await this.terminateSandbox(id)
    }
  }

  /**
   * Shutdown the sandbox manager and clean up resources
   */
  async shutdown(): Promise<void> {
    this.stopCleanup()
    await this.terminateAll()
  }
}

// Export singleton instance
export const sandboxManager = new SandboxManager()

// Also maintain backward compatibility with global state
declare global {
  // eslint-disable-next-line no-var
  var sandboxManager: SandboxManager | undefined
}

// Ensure the global reference points to our singleton
globalThis.sandboxManager = sandboxManager
