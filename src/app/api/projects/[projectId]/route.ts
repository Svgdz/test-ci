import { NextRequest, NextResponse } from 'next/server'
import { checkAuthenticated } from '@/lib/utils/server'
import { getProject } from '@/server/projects/get-projects'
import { l } from '@/lib/clients/logger'

interface RouteContext {
  params: Promise<{ projectId: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await checkAuthenticated()

    const { projectId } = await context.params

    /*
     * Get project using server action
     * getProject handles validation and user access control
     */
    const result = await getProject({ projectId })

    if (result.serverError) {
      const status = result.serverError.includes('not found') ? 404 : 500
      return NextResponse.json({ error: result.serverError }, { status })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    l.error(
      { key: 'project_api:get_failed', error, projectId: (await context.params).projectId },
      'Failed to get project'
    )
    return NextResponse.json({ error: 'Failed to get project' }, { status: 500 })
  }
}
