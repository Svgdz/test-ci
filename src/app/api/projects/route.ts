import { NextRequest, NextResponse } from 'next/server'
import { checkAuthenticated } from '@/lib/utils/server'
import { listProjects } from '@/server/projects/get-projects'
import { createProject } from '@/server/projects/project-actions'
import { l } from '@/lib/clients/logger'

export async function GET() {
  try {
    await checkAuthenticated()

    const result = await listProjects({})

    if (result.serverError) {
      return NextResponse.json({ error: result.serverError }, { status: 500 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    l.error({ key: 'projects_api:get_failed', error }, 'Failed to list projects')
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await checkAuthenticated()

    const { prompt, template = 'react-vite' } = (await request.json()) as {
      prompt?: string
      template?: string
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    /*
     * Create project using server action
     * createProject handles sandbox creation and database insertion
     */
    const result = await createProject({ prompt, template })

    if (result.serverError || !result.data?.project) {
      return NextResponse.json(
        { error: result.serverError || 'Failed to create project' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      type: 'redirect',
      projectId: (result.data.project as { id: string }).id,
      initialPrompt: prompt,
    })
  } catch (error) {
    l.error({ key: 'projects_api:create_failed', error }, 'Failed to create project')
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
