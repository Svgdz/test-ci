'use server'

import { authActionClient } from '@/lib/clients/action'
import { l } from '@/lib/clients/logger'
import { returnServerError } from '@/lib/utils/action'
import { SandboxFactory } from '@/server/sandbox/factory'
import { sandboxManager } from '@/server/sandbox/manager'
import { TablesInsert, Tables, Json } from '@/types/database.types'
import {
  CreateProjectSchema,
  GetProjectSchema,
  UpdateProjectStatusSchema,
  UpdateProjectSchema,
  DeleteProjectSchema,
  CreateProjectSecretSchema,
  UpdateProjectSecretSchema,
  DeleteProjectSecretSchema,
  ProjectSettingsSchema,
} from './types'
// Removed old E2B import - using new provider system
import { SupabaseVaultManager } from '@/server/vault'
import type { SupabaseRpcClient } from '@/server/vault/supabase-vault'

/**
 * Create a new project with associated sandbox and database record
 * This handles the complete project creation pipeline
 */
export const createProject = authActionClient
  .schema(CreateProjectSchema)
  .metadata({ actionName: 'createProject' })
  .action(async ({ parsedInput, ctx }) => {
    const { prompt, template } = parsedInput
    const { session, supabase } = ctx

    try {
      l.info({
        key: 'create_project:start',
        prompt: prompt.substring(0, 100),
        template,
        userId: session.user.id,
      })

      // Create sandbox using the new system (E2B v2)
      let sandboxId: string
      try {
        const provider = SandboxFactory.create()
        const sandboxInfo = await provider.createSandbox()

        // Initialize Vite React app inside sandbox
        await provider.setupViteApp()

        // Register with manager
        sandboxManager.registerSandbox(sandboxInfo.sandboxId, provider)

        sandboxId = sandboxInfo.sandboxId
      } catch (sandboxError) {
        l.error({
          key: 'create_project:sandbox_failed',
          error: sandboxError,
          template,
          userId: session.user.id,
        })

        if (
          sandboxError instanceof Error &&
          sandboxError.message.includes('E2B API key not configured')
        ) {
          return returnServerError('E2B API key is not configured. Please contact support.')
        }

        return returnServerError(
          `Failed to create sandbox: ${sandboxError instanceof Error ? sandboxError.message : 'Unknown sandbox error'}`
        )
      }

      l.info({
        key: 'create_project:sandbox_created',
        sandboxId,
        userId: session.user.id,
      })

      // Generate project name from prompt
      const projectName = (() => {
        const words = prompt
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter((word) => word.length > 2)
          .slice(0, 3)

        if (words.length === 0) {
          return 'New Project'
        }

        return (
          words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') +
          ` ${Date.now()}`
        )
      })()

      // Create project record in database using authenticated client

      // Note: slug is a generated column and must be omitted from insert
      const projectData = {
        account_id: session.user.id,
        name: projectName,
        description: prompt,
        sandbox_id: sandboxId,
        template,
        created_by: session.user.id,
        sandbox_status: 'active',
        sandbox_last_active: new Date().toISOString(),
        visibility: 'private',
        ai_model: 'claude-3-5-sonnet-20241022',
        default_domain: `${sandboxId}.e2b.dev`,
      } as TablesInsert<'projects'>

      const { data: project, error: dbError } = await supabase
        .from('projects')
        .insert(projectData)
        .select()
        .single()

      if (dbError) {
        l.error({
          key: 'create_project:db_error',
          error: dbError,
          userId: session.user.id,
        })
        return returnServerError(
          `Database error: ${dbError.message || 'Failed to create project record'}`
        )
      }

      if (!project) {
        l.error({
          key: 'create_project:no_project_returned',
          userId: session.user.id,
        })
        return returnServerError('Database did not return project after creation')
      }

      l.info({
        key: 'create_project:success',
        projectId: (project as Tables<'projects'>).id,
        sandboxId,
        userId: session.user.id,
      })

      // Return project data for client-side redirect
      return { project }
    } catch (error: unknown) {
      l.error({
        key: 'create_project:failed',
        error,
        prompt: prompt.substring(0, 100),
        userId: session.user.id,
      })

      // Provide more specific error message
      if (error instanceof Error) {
        return returnServerError(`Failed to create project: ${error.message}`)
      }

      return returnServerError('Failed to create project: Unknown error')
    }
  })

// Get project by ID with user access validation

// Update project sandbox status
export const updateProjectStatus = authActionClient
  .schema(UpdateProjectStatusSchema)
  .metadata({ actionName: 'updateProjectStatus' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId, status } = parsedInput
    const { session, supabase } = ctx

    try {
      const { error } = await supabase
        .from('projects')
        .update({
          sandbox_status: status,
          sandbox_last_active: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .eq('account_id', session.user.id)

      if (error) {
        l.error({
          key: 'update_project_status:failed',
          error,
          projectId,
          userId: session.user.id,
        })
        return returnServerError('Failed to update project status')
      }

      return { success: true }
    } catch (error) {
      l.error({
        key: 'update_project_status:failed',
        error,
        projectId,
        userId: session.user.id,
      })

      return returnServerError('Failed to update project status')
    }
  })

// REMOVED: loadProjectFiles - Use direct API calls to /api/sandbox/files instead
// This eliminates redundancy and follows the cleaner WorkspaceV3 approach

// Update project details (name, description, visibility, etc.)
export const updateProject = authActionClient
  .schema(UpdateProjectSchema)
  .metadata({ actionName: 'updateProject' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId, name, description, visibility, watermark } = parsedInput
    const { session, supabase } = ctx

    try {
      // Build update object with only provided fields
      const updateData: Partial<Tables<'projects'>> = {
        updated_at: new Date().toISOString(),
      }

      if (name !== undefined) {
        updateData.name = name
        // Note: slug is a generated column and will be automatically updated by the database
      }

      if (description !== undefined) updateData.description = description
      if (visibility !== undefined) updateData.visibility = visibility
      if (watermark !== undefined) updateData.watermark = watermark

      const { data: project, error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId)
        .eq('account_id', session.user.id)
        .select()
        .single()

      if (error || !project) {
        l.error({
          key: 'update_project:failed',
          error,
          projectId,
          userId: session.user.id,
        })
        return returnServerError('Failed to update project')
      }

      l.info({
        key: 'update_project:success',
        projectId,
        updatedFields: Object.keys(updateData),
        userId: session.user.id,
      })

      return { project }
    } catch (error) {
      l.error({
        key: 'update_project:failed',
        error,
        projectId,
        userId: session.user.id,
      })

      return returnServerError('Failed to update project')
    }
  })

// Delete project and associated resources
export const deleteProject = authActionClient
  .schema(DeleteProjectSchema)
  .metadata({ actionName: 'deleteProject' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId } = parsedInput
    const { session, supabase } = ctx

    try {
      // First, get the project to access sandbox_id for cleanup
      const { data: project, error: fetchError } = await supabase
        .from('projects')
        .select('sandbox_id, name')
        .eq('id', projectId)
        .eq('account_id', session.user.id)
        .single()

      if (fetchError || !project) {
        l.warn({
          key: 'delete_project:not_found',
          projectId,
          userId: session.user.id,
        })
        return returnServerError('Project not found')
      }

      // Delete the project from database
      const { error: deleteError } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('account_id', session.user.id)

      if (deleteError) {
        l.error({
          key: 'delete_project:db_error',
          error: deleteError,
          projectId,
          userId: session.user.id,
        })
        return returnServerError('Failed to delete project')
      }

      // Clean up sandbox using the new provider system
      if (project.sandbox_id) {
        try {
          await sandboxManager.terminateSandbox(project.sandbox_id)
          l.info({
            key: 'delete_project:sandbox_cleanup',
            projectId,
            sandboxId: project.sandbox_id,
            userId: session.user.id,
          })
        } catch (sandboxError) {
          l.warn({
            key: 'delete_project:sandbox_cleanup_failed',
            error: sandboxError,
            sandboxId: project.sandbox_id,
            userId: session.user.id,
          })
        }
      }

      l.info({
        key: 'delete_project:success',
        projectId,
        projectName: project.name,
        sandboxId: project.sandbox_id,
        userId: session.user.id,
      })

      return { success: true }
    } catch (error) {
      l.error({
        key: 'delete_project:failed',
        error,
        projectId,
        userId: session.user.id,
      })

      return returnServerError('Failed to delete project')
    }
  })

// Project Secrets Management
export const createProjectSecret = authActionClient
  .schema(CreateProjectSecretSchema)
  .metadata({ actionName: 'createProjectSecret' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId, key, value } = parsedInput
    const { session, supabase } = ctx

    try {
      // Verify project ownership
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('account_id', session.user.id)
        .single()

      if (projectError || !project) {
        return returnServerError('Project not found')
      }

      // Check if secret key already exists
      const { data: existingSecret } = await supabase
        .from('project_secrets')
        .select('id')
        .eq('project_id', projectId)
        .eq('key', key)
        .single()

      if (existingSecret) {
        return returnServerError('Secret key already exists')
      }

      // Create vault manager instance
      const vaultManager = new SupabaseVaultManager(
        projectId,
        supabase as unknown as SupabaseRpcClient
      )

      // Store secret in vault first
      const vaultResult = await vaultManager.createSecret(key, value)
      if (!vaultResult.success) {
        l.error({
          key: 'create_project_secret:vault_failed',
          error: vaultResult.error,
          projectId,
          userId: session.user.id,
        })
        return returnServerError(`Failed to store secret in vault: ${vaultResult.error}`)
      }

      // Create secret record in database
      const vaultSecretName = `project-${projectId}-${key.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
      const { data: secret, error } = await supabase
        .from('project_secrets')
        .insert({
          project_id: projectId,
          key,
          vault_secret_name: vaultSecretName,
          created_by: session.user.id,
        })
        .select()
        .single()

      if (error) {
        l.error({
          key: 'create_project_secret:db_failed',
          error,
          projectId,
          userId: session.user.id,
        })
        // Clean up vault secret if database insert fails
        await vaultManager.deleteSecret(key)
        return returnServerError('Failed to create secret record')
      }

      l.info({
        key: 'create_project_secret:success',
        projectId,
        secretId: (secret as { id: string }).id,
        userId: session.user.id,
      })

      return { secret }
    } catch (error) {
      l.error({
        key: 'create_project_secret:failed',
        error,
        projectId,
        userId: session.user.id,
      })
      return returnServerError('Failed to create secret')
    }
  })

export const getProjectSecrets = authActionClient
  .schema(GetProjectSchema)
  .metadata({ actionName: 'getProjectSecrets' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId } = parsedInput
    const { session, supabase } = ctx

    try {
      // Verify project ownership
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('account_id', session.user.id)
        .single()

      if (projectError || !project) {
        return returnServerError('Project not found')
      }

      // Get project secrets from database
      const { data: secrets, error } = await supabase
        .from('project_secrets')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (error) {
        l.error({
          key: 'get_project_secrets:failed',
          error,
          projectId,
          userId: session.user.id,
        })
        return returnServerError('Failed to retrieve secrets')
      }

      // Create vault manager instance
      const vaultManager = new SupabaseVaultManager(
        projectId,
        supabase as unknown as SupabaseRpcClient
      )

      // Retrieve actual secret values from vault
      const secretsWithValues = await Promise.all(
        ((secrets as { key: string; [key: string]: unknown }[]) || []).map(async (secret) => {
          const vaultResult = await vaultManager.getSecret(secret.key)
          return {
            ...secret,
            value: vaultResult.success ? vaultResult.value : '***ERROR***',
            vault_error: vaultResult.success ? null : vaultResult.error,
          }
        })
      )

      return { secrets: secretsWithValues }
    } catch (error) {
      l.error({
        key: 'get_project_secrets:failed',
        error,
        projectId,
        userId: session.user.id,
      })
      return returnServerError('Failed to retrieve secrets')
    }
  })

export const updateProjectSecret = authActionClient
  .schema(UpdateProjectSecretSchema)
  .metadata({ actionName: 'updateProjectSecret' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId, secretId, key, value } = parsedInput
    const { session, supabase } = ctx

    try {
      // Verify project ownership and secret exists
      const { data: secret, error: fetchError } = await supabase
        .from('project_secrets')
        .select(
          `
          *,
          projects!inner(account_id)
        `
        )
        .eq('id', secretId)
        .eq('project_id', projectId)
        .eq('projects.account_id', session.user.id)
        .single()

      if (fetchError || !secret) {
        return returnServerError('Secret not found')
      }

      // Build update object
      const updateData: { updated_at: string; key?: string; vault_secret_name?: string } = {
        updated_at: new Date().toISOString(),
      }

      if (key !== undefined) {
        // Check if new key already exists
        const { data: existingSecret } = await supabase
          .from('project_secrets')
          .select('id')
          .eq('project_id', projectId)
          .eq('key', key)
          .neq('id', secretId)
          .single()

        if (existingSecret) {
          return returnServerError('Secret key already exists')
        }

        updateData.key = key
        updateData.vault_secret_name = `${projectId}-${key}`
      }

      // Update secret in database
      const { data: updatedSecret, error } = await supabase
        .from('project_secrets')
        .update(updateData)
        .eq('id', secretId)
        .select()
        .single()

      if (error) {
        l.error({
          key: 'update_project_secret:db_failed',
          error,
          projectId,
          secretId,
          userId: session.user.id,
        })
        return returnServerError('Failed to update secret record')
      }

      // Update secret value in vault if provided
      if (value !== undefined) {
        const vaultManager = new SupabaseVaultManager(
          projectId,
          supabase as unknown as SupabaseRpcClient
        )
        const vaultResult = await vaultManager.updateSecret(
          (secret as unknown as { key: string }).key,
          value
        )

        if (!vaultResult.success) {
          l.error({
            key: 'update_project_secret:vault_failed',
            error: vaultResult.error,
            projectId,
            secretId,
            userId: session.user.id,
          })
          return returnServerError(`Failed to update secret in vault: ${vaultResult.error}`)
        }
      }

      l.info({
        key: 'update_project_secret:success',
        projectId,
        secretId,
        userId: session.user.id,
      })

      return { secret: updatedSecret }
    } catch (error) {
      l.error({
        key: 'update_project_secret:failed',
        error,
        projectId,
        secretId,
        userId: session.user.id,
      })
      return returnServerError('Failed to update secret')
    }
  })

export const deleteProjectSecret = authActionClient
  .schema(DeleteProjectSecretSchema)
  .metadata({ actionName: 'deleteProjectSecret' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId, secretId } = parsedInput
    const { session, supabase } = ctx

    try {
      // Verify project ownership and secret exists
      const { data: secret, error: fetchError } = await supabase
        .from('project_secrets')
        .select(
          `
          *,
          projects!inner(account_id)
        `
        )
        .eq('id', secretId)
        .eq('project_id', projectId)
        .eq('projects.account_id', session.user.id)
        .single()

      if (fetchError || !secret) {
        return returnServerError('Secret not found')
      }

      // Delete secret from vault first
      const vaultManager = new SupabaseVaultManager(
        projectId,
        supabase as unknown as SupabaseRpcClient
      )
      const vaultResult = await vaultManager.deleteSecret(
        (secret as unknown as { key: string }).key
      )

      if (!vaultResult.success) {
        l.warn({
          key: 'delete_project_secret:vault_warning',
          error: vaultResult.error,
          projectId,
          secretId,
          userId: session.user.id,
        })
        // Continue with database deletion even if vault deletion fails
      }

      // Delete secret from database
      const { error } = await supabase.from('project_secrets').delete().eq('id', secretId)

      if (error) {
        l.error({
          key: 'delete_project_secret:db_failed',
          error,
          projectId,
          secretId,
          userId: session.user.id,
        })
        return returnServerError('Failed to delete secret record')
      }

      l.info({
        key: 'delete_project_secret:success',
        projectId,
        secretId,
        userId: session.user.id,
      })

      return { success: true }
    } catch (error) {
      l.error({
        key: 'delete_project_secret:failed',
        error,
        projectId,
        secretId,
        userId: session.user.id,
      })
      return returnServerError('Failed to delete secret')
    }
  })

// Project Settings Management
export const updateProjectSettings = authActionClient
  .schema(ProjectSettingsSchema)
  .metadata({ actionName: 'updateProjectSettings' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId, ...settings } = parsedInput
    const { session, supabase } = ctx

    try {
      // Verify project ownership
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('account_id', session.user.id)
        .single()

      if (projectError || !project) {
        return returnServerError('Project not found')
      }

      // Store settings in sandbox_metadata JSON field
      const { data: currentProject } = await supabase
        .from('projects')
        .select('sandbox_metadata')
        .eq('id', projectId)
        .single()

      const currentMetadata =
        (currentProject?.sandbox_metadata as { settings?: Record<string, unknown> }) || {}
      const updatedMetadata = {
        ...currentMetadata,
        settings: {
          ...(currentMetadata.settings || {}),
          ...settings,
        },
      }

      const { data: updatedProject, error } = await supabase
        .from('projects')
        .update({
          sandbox_metadata: updatedMetadata as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select()
        .single()

      if (error) {
        l.error({
          key: 'update_project_settings:failed',
          error,
          projectId,
          userId: session.user.id,
        })
        return returnServerError('Failed to update project settings')
      }

      l.info({
        key: 'update_project_settings:success',
        projectId,
        updatedSettings: Object.keys(settings),
        userId: session.user.id,
      })

      return { project: updatedProject }
    } catch (error) {
      l.error({
        key: 'update_project_settings:failed',
        error,
        projectId,
        userId: session.user.id,
      })
      return returnServerError('Failed to update project settings')
    }
  })

export const getProjectSettings = authActionClient
  .schema(GetProjectSchema)
  .metadata({ actionName: 'getProjectSettings' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId } = parsedInput
    const { session, supabase } = ctx

    try {
      // Get project with settings
      const { data: project, error } = await supabase
        .from('projects')
        .select('sandbox_metadata')
        .eq('id', projectId)
        .eq('account_id', session.user.id)
        .single()

      if (error || !project) {
        return returnServerError('Project not found')
      }

      const metadata = (project.sandbox_metadata as { settings?: Record<string, unknown> }) || {}
      const settings = metadata.settings || {}

      return { settings }
    } catch (error) {
      l.error({
        key: 'get_project_settings:failed',
        error,
        projectId,
        userId: session.user.id,
      })
      return returnServerError('Failed to retrieve project settings')
    }
  })
