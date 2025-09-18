import { getProject } from '@/server/projects/get-projects'
import { getSessionInsecure } from '@/server/auth/get-session'
import { redirect } from 'next/navigation'
import { AUTH_URLS } from '@/configs/urls'
import { WorkspaceInitializer } from './WorkspaceInitializer'

interface ProjectWorkspacePageProps {
  projectId: string
  initialPrompt?: string
}

/**
 * Server component that handles authentication and project data fetching for workspace
 */
export async function ProjectWorkspacePage({
  projectId,
  initialPrompt,
}: ProjectWorkspacePageProps) {
  // Check authentication
  const session = await getSessionInsecure()
  if (!session) {
    redirect(`${AUTH_URLS.SIGN_IN}?returnTo=${encodeURIComponent(`/workspace/${projectId}`)}`)
  }

  // Get project data using our server action
  try {
    const result = await getProject({ projectId })

    if (result?.serverError || !result?.data?.project) {
      // Project not found or access denied
      console.error('Project not found:', result?.serverError)
      redirect('/')
    }

    const { project } = result.data

    // Use the new WorkspaceInitializer which handles async sandbox setup
    return (
      <WorkspaceInitializer
        projectId={projectId}
        initialPrompt={initialPrompt}
        project={{
          id: project.id,
          name: project.name,
          sandbox_id: project.sandbox_id,
          sandbox_status: project.sandbox_status,
          description: project.description,
        }}
      />
    )
  } catch (error) {
    console.error('Failed to load project:', error)
    redirect('/')
  }
}
