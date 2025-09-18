import { getProject } from '@/server/projects/get-projects'
import { getSessionInsecure } from '@/server/auth/get-session'
import { redirect } from 'next/navigation'
import { AUTH_URLS } from '@/configs/urls'
import { WorkspaceProvider } from '@/components/workspace/context/WorkspaceProvider'
import { WorkspaceV3 } from '@/components/workspace/layout/WorkspaceV3'

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

    if (!project.sandbox_id) {
      return (
        <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
          <div className='text-center'>
            <h2 className='text-lg font-medium text-gray-900 mb-2'>No Sandbox</h2>
            <p className='text-gray-600'>This project doesn't have an associated sandbox.</p>
          </div>
        </div>
      )
    }

    return (
      <WorkspaceProvider sandboxId={project.sandbox_id} projectId={project.id}>
        <div className='bg-white h-screen flex flex-col'>
          <div className='flex-1'>
            <WorkspaceV3
              sandboxKey={project.id}
              sandboxId={project.sandbox_id}
              initialPrompt={initialPrompt}
            />
          </div>
        </div>
      </WorkspaceProvider>
    )
  } catch (error) {
    console.error('Failed to load project:', error)
    redirect('/')
  }
}
