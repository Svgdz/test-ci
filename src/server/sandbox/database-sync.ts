import 'server-cli-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Database sync utilities for sandbox status
export class SandboxDatabaseSync {
  private supabase: ReturnType<typeof createClient<Database>> | null = null

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient<Database>(supabaseUrl, supabaseKey)
    }
  }

  /**
   * Initialize with Supabase client
   */
  initialize(supabase: ReturnType<typeof createClient<Database>>): void {
    this.supabase = supabase
  }

  /**
   * Update sandbox status in database
   */
  async updateSandboxStatus(
    projectId: string,
    sandboxId: string,
    status: 'active' | 'paused' | 'terminated',
    metadata?: {
      totalRuntime?: number
      lastAccessed?: Date
      pausedAt?: Date
    }
  ): Promise<boolean> {
    if (!this.supabase) {
      console.warn('[SandboxDatabaseSync] Supabase client not initialized')
      return false
    }

    try {
      const updateData: Database['public']['Tables']['projects']['Update'] = {
        sandbox_status: status,
        sandbox_last_active: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // Add metadata if provided
      if (metadata) {
        updateData.sandbox_metadata = {
          totalRuntime: metadata.totalRuntime,
          lastAccessed: metadata.lastAccessed?.toISOString(),
          pausedAt: metadata.pausedAt?.toISOString(),
        }
      }

      const { error } = await this.supabase
        .from('projects')
        .update(updateData)
        .eq('sandbox_id', sandboxId)

      if (error) {
        console.error('[SandboxDatabaseSync] Error updating sandbox status:', error)
        return false
      }

      console.log(`[SandboxDatabaseSync] Updated sandbox ${sandboxId} status to ${status}`)
      return true
    } catch (error) {
      console.error('[SandboxDatabaseSync] Error updating sandbox status:', error)
      return false
    }
  }

  /**
   * Get projects with active or paused sandboxes
   */
  async getActiveSandboxProjects(): Promise<
    Array<{
      id: string
      sandboxId: string
      status: string
      lastActive: string
    }>
  > {
    if (!this.supabase) {
      console.warn('[SandboxDatabaseSync] Supabase client not initialized')
      return []
    }

    try {
      const { data, error } = await this.supabase
        .from('projects')
        .select('id, sandbox_id, sandbox_status, sandbox_last_active')
        .not('sandbox_id', 'is', null)
        .in('sandbox_status', ['active', 'paused'])

      if (error) {
        console.error('[SandboxDatabaseSync] Error fetching active sandboxes:', error)
        return []
      }

      return (data || []).map((project) => ({
        id: project.id,
        sandboxId: project.sandbox_id!,
        status: project.sandbox_status || 'unknown',
        lastActive: project.sandbox_last_active || new Date().toISOString(),
      }))
    } catch (error) {
      console.error('[SandboxDatabaseSync] Error fetching active sandboxes:', error)
      return []
    }
  }

  /**
   * Cleanup terminated sandbox references in database
   */
  async cleanupTerminatedSandboxes(): Promise<number> {
    if (!this.supabase) {
      console.warn('[SandboxDatabaseSync] Supabase client not initialized')
      return 0
    }

    try {
      const { data, error } = await this.supabase
        .from('projects')
        .update({
          sandbox_id: null,
          sandbox_status: null,
          sandbox_last_active: null,
          sandbox_metadata: null,
          updated_at: new Date().toISOString(),
        })
        .eq('sandbox_status', 'terminated')
        .select('id')

      if (error) {
        console.error('[SandboxDatabaseSync] Error cleaning up terminated sandboxes:', error)
        return 0
      }

      const count = data?.length || 0
      console.log(`[SandboxDatabaseSync] Cleaned up ${count} terminated sandbox references`)
      return count
    } catch (error) {
      console.error('[SandboxDatabaseSync] Error cleaning up terminated sandboxes:', error)
      return 0
    }
  }
}

// Export singleton instance
export const sandboxDatabaseSync = new SandboxDatabaseSync()
