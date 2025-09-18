import { NextRequest, NextResponse } from 'next/server'
import { checkAuthenticated } from '@/lib/utils/server'
import { initializeWorkspace } from '@/server/projects/project-actions'
import { l } from '@/lib/clients/logger'

export async function POST(request: NextRequest) {
  try {
    await checkAuthenticated()

    const { projectId } = (await request.json()) as {
      projectId?: string
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    l.info({
      key: 'workspace_initialize_api:start',
      projectId,
    })

    // Initialize workspace with sandbox creation
    const result = await initializeWorkspace({ projectId })

    if (result.serverError) {
      l.error({
        key: 'workspace_initialize_api:failed',
        error: result.serverError,
        projectId,
      })
      return NextResponse.json({ error: result.serverError }, { status: 500 })
    }

    if (!result.data) {
      return NextResponse.json({ error: 'Failed to initialize workspace' }, { status: 500 })
    }

    l.info({
      key: 'workspace_initialize_api:success',
      projectId,
      sandboxId: result.data.sandboxId,
    })

    return NextResponse.json({
      success: true,
      project: result.data.project,
      sandboxId: result.data.sandboxId,
      sandboxUrl: result.data.sandboxUrl,
      message: result.data.message,
      alreadyInitialized: result.data.alreadyInitialized || false,
    })
  } catch (error) {
    l.error({ key: 'workspace_initialize_api:error', error }, 'Failed to initialize workspace')
    return NextResponse.json({ error: 'Failed to initialize workspace' }, { status: 500 })
  }
}
