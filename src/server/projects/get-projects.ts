'use server'

import { authActionClient } from '@/lib/clients/action'
import { l } from '@/lib/clients/logger'
import { returnServerError } from '@/lib/utils/action'
import { Tables } from '@/types/database.types'
import { GetProjectSchema, GetProjectsSchema } from './types'

/**
 * Get a single project by ID
 * Ensures the project belongs to the authenticated user
 */
export const getProject = authActionClient
  .schema(GetProjectSchema)
  .metadata({ actionName: 'getProject' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId } = parsedInput
    const { session, supabase } = ctx

    try {
      const { data: project, error } = (await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .eq('account_id', session.user.id)
        .single()) as {
        data: Tables<'projects'> | null
        error: { message: string; code?: string } | null
      }

      if (error || !project) {
        l.warn({
          key: 'get_project:not_found',
          projectId,
          userId: session.user.id,
        })
        return returnServerError('Project not found')
      }

      return { project }
    } catch (error) {
      l.error({
        key: 'get_project:failed',
        error,
        projectId,
        userId: session.user.id,
      })

      return returnServerError('Failed to retrieve project')
    }
  })

/**
 * List all projects for the authenticated user
 * Returns projects ordered by most recently updated
 */
export const listProjects = authActionClient
  .schema(GetProjectsSchema)
  .metadata({ actionName: 'listProjects' })
  .action(async ({ ctx }) => {
    const { session, supabase } = ctx

    try {
      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('account_id', session.user.id)
        .order('updated_at', { ascending: false })

      if (error) {
        l.error({
          key: 'list_projects:failed',
          error,
          userId: session.user.id,
        })
        return returnServerError('Failed to retrieve projects')
      }

      return { projects: projects || [] }
    } catch (error) {
      l.error({
        key: 'list_projects:failed',
        error,
        userId: session.user.id,
      })

      return returnServerError('Failed to retrieve projects')
    }
  })
