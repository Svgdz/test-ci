'use server'

import { authActionClient } from '@/lib/clients/action'
import { l } from '@/lib/clients/logger'

export const getSandboxLogsAction = authActionClient
  .metadata({ actionName: 'getSandboxLogs' })
  .action(async ({ ctx }) => {
    const { session } = ctx

    try {
      const { sandboxManager } = await import('@/server/sandbox/manager')
      const provider = sandboxManager.getActiveProvider()

      if (!provider) {
        return { success: false as const, serverError: 'No active sandbox' }
      }

      l.info({ key: 'sandbox_logs:start', userId: session.user.id })

      // Check ps for vite-related processes
      const logs: string[] = []
      let viteRunning = false

      try {
        const ps = await provider.runCommand('ps aux')
        if (ps.exitCode === 0) {
          const viteProcesses = ps.stdout
            .split('\n')
            .filter(
              (line) =>
                line.toLowerCase().includes('vite') || line.toLowerCase().includes('npm run dev')
            )
          viteRunning = viteProcesses.length > 0
          if (viteRunning) {
            logs.push('Vite is running')
            logs.push(...viteProcesses.slice(0, 3))
          } else {
            logs.push('Vite process not found')
          }
        }
      } catch {
        // ignore ps errors
      }

      // Scan /tmp for vite-related logs and tail last lines
      try {
        const find = await provider.runCommand("find /tmp -name '*vite*' -name '*.log' -type f")
        if (find.exitCode === 0) {
          const files = find.stdout
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
          for (const file of files.slice(0, 2)) {
            try {
              const tail = await provider.runCommand(`tail -n 10 ${file}`)
              if (tail.exitCode === 0) {
                logs.push(`--- ${file} ---`)
                logs.push(tail.stdout)
              }
            } catch {
              // ignore tail failures
            }
          }
        }
      } catch {
        // ignore find failures
      }

      return {
        success: true as const,
        hasErrors: false as const,
        logs,
        status: viteRunning ? ('running' as const) : ('stopped' as const),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      l.error({ key: 'sandbox_logs:error', error: message, userId: session.user.id })
      return { success: false as const, serverError: message }
    }
  })

export type GetSandboxLogsResult =
  | { success: true; hasErrors: false; logs: string[]; status: 'running' | 'stopped' }
  | { success: false; serverError: string }
