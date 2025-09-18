'use server'

import { authActionClient } from '@/lib/clients/action'
import { l } from '@/lib/clients/logger'
import { z } from 'zod'

const WriteFileSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  content: z.string(),
  sandboxId: z.string().optional(),
})

export const writeSandboxFileAction = authActionClient
  .schema(WriteFileSchema)
  .metadata({ actionName: 'writeSandboxFile' })
  .action(async ({ parsedInput, ctx }) => {
    const { session } = ctx
    const { filePath, content, sandboxId } = parsedInput

    try {
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
        return { success: false as const, serverError: 'No active sandbox' }
      }

      l.info({ key: 'write_file:start', filePath, userId: session.user.id })
      await provider.writeFile(filePath, content)

      return {
        success: true as const,
        message: 'File written successfully',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      l.error({ key: 'write_file:error', error: message, userId: session.user.id })
      return { success: false as const, serverError: message }
    }
  })

export type WriteSandboxFileInput = z.infer<typeof WriteFileSchema>
