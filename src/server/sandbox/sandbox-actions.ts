'use server'

import { authActionClient } from '@/lib/clients/action'
import { l } from '@/lib/clients/logger'
import { z } from 'zod'
import { SandboxFactory } from '@/server/sandbox/factory'
import { sandboxManager } from '@/server/sandbox/manager'

const CreateAndAttachSandboxSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
})

export const createAndAttachSandbox = authActionClient
  .schema(CreateAndAttachSandboxSchema)
  .metadata({ actionName: 'createAndAttachSandbox' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId } = parsedInput
    const { session, supabase } = ctx

    try {
      l.info({ key: 'sandbox:create_attach:start', projectId, userId: session.user.id })

      // Clean up existing sandboxes (process-level) to avoid stray processes
      try {
        await sandboxManager.terminateAll()
      } catch (cleanupError) {
        l.warn({ key: 'sandbox:create_attach:cleanup_failed', error: cleanupError })
      }

      // Reset legacy global tracking
      const g1 = globalThis as unknown as {
        activeSandboxProvider?: { terminate?: () => Promise<void> }
      }
      if (g1.activeSandboxProvider) {
        try {
          await g1.activeSandboxProvider.terminate?.()
        } catch (e) {
          l.warn({ key: 'sandbox:create_attach:legacy_terminate_failed', error: e })
        }
        g1.activeSandboxProvider = null as unknown as undefined
      }
      if (!(globalThis as { existingFiles?: Set<string> }).existingFiles) {
        ;(globalThis as { existingFiles?: Set<string> }).existingFiles = new Set<string>()
      } else {
        ;(globalThis as { existingFiles?: Set<string> }).existingFiles!.clear()
      }

      // Create sandbox
      const provider = SandboxFactory.create()
      const sandboxInfo = await provider.createSandbox()

      // Initialize Vite React app inside sandbox (E2B v2 approach)
      await provider.setupViteApp()

      // Register with manager and set legacy globals (for backward compatibility)
      sandboxManager.registerSandbox(sandboxInfo.sandboxId, provider)
      ;(globalThis as { activeSandboxProvider?: unknown }).activeSandboxProvider = provider
      ;(globalThis as { sandboxData?: { sandboxId: string; url: string } }).sandboxData = {
        sandboxId: sandboxInfo.sandboxId,
        url: sandboxInfo.url,
      }

      // Persist sandboxId to the user's project
      const { error: updateError } = await supabase
        .from('projects')
        .update({
          sandbox_id: sandboxInfo.sandboxId,
          sandbox_status: 'active',
          sandbox_last_active: new Date().toISOString(),
          default_domain: sandboxInfo.url, // Store the complete URL from provider
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .eq('account_id', session.user.id)

      if (updateError) {
        l.error({ key: 'sandbox:create_attach:update_failed', error: updateError, projectId })
        return { success: false as const, serverError: 'Failed to update project with sandboxId' }
      }

      l.info({ key: 'sandbox:create_attach:success', projectId, sandboxId: sandboxInfo.sandboxId })

      return {
        success: true as const,
        sandbox: sandboxInfo,
        message: 'Sandbox created, initialized, and attached to project',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      l.error({ key: 'sandbox:create_attach:error', error: message, projectId })

      try {
        await sandboxManager.terminateAll()
      } catch {
        // Ignore cleanup errors during error handling
      }

      return { success: false as const, serverError: message }
    }
  })

export type CreateAndAttachSandboxInput = z.infer<typeof CreateAndAttachSandboxSchema>
