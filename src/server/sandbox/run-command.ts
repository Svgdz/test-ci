'use server'

import { authActionClient } from '@/lib/clients/action'
import { l } from '@/lib/clients/logger'
import { z } from 'zod'

const RunCommandSchema = z.object({
  command: z.string().min(1, 'Command is required'),
})

export const runSandboxCommandAction = authActionClient
  .schema(RunCommandSchema)
  .metadata({ actionName: 'runSandboxCommandV2' })
  .action(async ({ parsedInput, ctx }) => {
    const { session } = ctx
    const { command } = parsedInput

    try {
      const { sandboxManager } = await import('@/server/sandbox/manager')
      const provider = sandboxManager.getActiveProvider()

      if (!provider) {
        return { success: false as const, serverError: 'No active sandbox' }
      }

      l.info({ key: 'run_command_v2:start', command, userId: session.user.id })
      const result = await provider.runCommand(command)

      return {
        success: result.success,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        message: result.success ? 'Command executed successfully' : 'Command failed',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      l.error({ key: 'run_command_v2:error', error: message, userId: session.user.id })
      return { success: false as const, serverError: message }
    }
  })

export type RunSandboxCommandInput = z.infer<typeof RunCommandSchema>
