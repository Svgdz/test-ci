import { getSessionInsecure } from '@/server/auth/get-session'
import { ClientHomePage } from '@/app/client-page'
import { listProjects } from '@/server/projects/get-projects'

interface ProjectsHomePageProps {
  initialPrompt?: string
}

/**
 * Server component that handles initial project data fetching for the home page
 */
export async function ProjectsHomePage({ initialPrompt = '' }: ProjectsHomePageProps) {
  const session = await getSessionInsecure()
  const isAuthenticated = !!session
  let projects: Array<{ id: string; name: string; default_domain?: string | null }> = []

  if (isAuthenticated) {
    try {
      const result = await listProjects({})
      if (result.data && !result.serverError) {
        // Map the full project data to the simplified format expected by ClientHomePage
        const projectsData = result.data.projects as Array<{
          id: string | number
          name?: string
          default_domain?: string | null
        }>
        projects = projectsData.map((project) => ({
          id: String(project.id),
          name: project.name || 'Untitled Project',
          default_domain: project.default_domain,
        }))
      }
    } catch {
      // Silently handle errors - ClientHomePage will show appropriate fallbacks
    }
  }

  return (
    <ClientHomePage
      initialPrompt={initialPrompt}
      isAuthenticated={isAuthenticated}
      initialProjects={projects}
    />
  )
}
