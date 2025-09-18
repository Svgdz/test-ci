import { ProjectWorkspacePage } from '@/components/projects/ProjectWorkspacePage'

interface WorkspacePageProps {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ prompt?: string }>
}

export default async function WorkspaceRoute({ params, searchParams }: WorkspacePageProps) {
  const { projectId } = await params
  const { prompt } = await searchParams

  const initialPrompt = prompt ? decodeURIComponent(prompt) : undefined

  return <ProjectWorkspacePage projectId={projectId} initialPrompt={initialPrompt} />
}
