import { ProjectsHomePage } from '@/components/projects/ProjectsHomePage'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>
}) {
  const { prompt: urlPrompt } = await searchParams

  return <ProjectsHomePage initialPrompt={urlPrompt ? decodeURIComponent(urlPrompt) : ''} />
}
