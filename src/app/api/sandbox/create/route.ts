import { NextRequest, NextResponse } from 'next/server'
import { checkAuthenticated } from '@/lib/utils/server'
import { createAndAttachSandbox } from '@/server/sandbox/sandbox-actions'
import { l } from '@/lib/clients/logger'

export async function POST(request: NextRequest) {
  try {
    await checkAuthenticated()

    const { projectId } = (await request.json()) as { projectId?: string }

    if (!projectId) {
      return NextResponse.json(
        { success: false, serverError: 'Project ID is required' },
        { status: 400 }
      )
    }

    /*
     * Create and attach sandbox using server action
     * createAndAttachSandbox handles sandbox creation and database updates
     */
    const result = await createAndAttachSandbox({ projectId })
    return NextResponse.json(result)
  } catch (error) {
    l.error({ key: 'sandbox_create:failed', error }, 'Failed to create sandbox')
    return NextResponse.json(
      { success: false, serverError: 'Failed to create sandbox' },
      { status: 500 }
    )
  }
}
