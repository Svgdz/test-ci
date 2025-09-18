import { NextRequest, NextResponse } from 'next/server'
import { checkAuthenticated } from '@/lib/utils/server'
import { runSandboxCommandAction } from '@/server/sandbox/run-command'
import { l } from '@/lib/clients/logger'

export async function POST(request: NextRequest) {
  try {
    await checkAuthenticated()

    const { command } = (await request.json()) as { command?: string }

    if (!command) {
      return NextResponse.json(
        { success: false, serverError: 'Command is required' },
        { status: 400 }
      )
    }

    /*
     * Run command in sandbox using server action
     * runSandboxCommandAction handles command execution and output capture
     */
    const result = await runSandboxCommandAction({ command })
    return NextResponse.json(result)
  } catch (error) {
    l.error({ key: 'sandbox_command:failed', error }, 'Failed to run sandbox command')
    return NextResponse.json(
      { success: false, serverError: 'Failed to run command' },
      { status: 500 }
    )
  }
}
