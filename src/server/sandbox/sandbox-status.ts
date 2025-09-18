'use server'

import { authActionClient } from '@/lib/clients/action'
import { l } from '@/lib/clients/logger'

type SandboxStatusData = {
  sandboxId?: string
  url?: string
  filesTracked: string[]
  lastHealthCheck: string
}

export const getSandboxStatusAction = authActionClient
  .metadata({ actionName: 'getSandboxStatus' })
  .action(async ({ ctx }) => {
    const { session } = ctx

    try {
      const { sandboxManager } = await import('@/server/sandbox/manager')
      const provider = sandboxManager.getActiveProvider()

      const active = !!provider
      let healthy = false
      let sandboxData: SandboxStatusData | null = null

      if (active && provider) {
        try {
          const info = provider.getSandboxInfo?.() || null
          healthy = !!info

          const g = globalThis as unknown as {
            existingFiles?: Set<string>
            sandboxData?: { sandboxId?: string; url?: string }
          }

          sandboxData = {
            sandboxId: info?.sandboxId || g.sandboxData?.sandboxId,
            url: info?.url || g.sandboxData?.url,
            filesTracked: g.existingFiles ? Array.from(g.existingFiles) : [],
            lastHealthCheck: new Date().toISOString(),
          }
        } catch (e) {
          l.warn({ key: 'sandbox_status:health_check_failed', error: e, userId: session.user.id })
          healthy = false
        }
      }

      return {
        success: true as const,
        active,
        healthy,
        sandboxData,
        message: healthy
          ? 'Sandbox is active and healthy'
          : active
            ? 'Sandbox exists but is not responding'
            : 'No active sandbox',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      l.error({ key: 'sandbox_status:error', error: message, userId: session.user.id })
      return { success: false as const, active: false as const, serverError: message }
    }
  })

export type GetSandboxStatusResult =
  | {
      success: true
      active: boolean
      healthy: boolean
      sandboxData: SandboxStatusData | null
      message: string
    }
  | { success: false; active: false; serverError: string }
