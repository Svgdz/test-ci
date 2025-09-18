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
 * Create a new project record in database (fast operation)
 * Sandbox creation is handled separately in workspace initialization
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

      // Create project record in database without sandbox (fast operation)
      // Note: slug is a generated column and must be omitted from insert
      const projectData = {
        account_id: session.user.id,
        name: projectName,
        description: prompt,
        sandbox_id: null, // Will be set during workspace initialization
        template,
        created_by: session.user.id,
        sandbox_status: null, // Will be set to 'active' when sandbox is created
        sandbox_last_active: new Date().toISOString(),
        visibility: 'private',
        ai_model: 'claude-3-5-sonnet-20241022',
        default_domain: 'https://initializing.placeholder.e2b.dev', // Placeholder - will be set when sandbox is created
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
        userId: session.user.id,
      })

      // Return project data for immediate client-side redirect
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

/**
 * Initialize workspace with sandbox creation and setup
 * This is called asynchronously from the workspace page
 */
export const initializeWorkspace = authActionClient
  .schema(GetProjectSchema) // Reuse the same schema that takes projectId
  .metadata({ actionName: 'initializeWorkspace' })
  .action(async ({ parsedInput, ctx }) => {
    const { projectId } = parsedInput
    const { session, supabase } = ctx

    try {
      l.info({
        key: 'initialize_workspace:start',
        projectId,
        userId: session.user.id,
      })

      // Get project to verify ownership and get template/description
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .eq('account_id', session.user.id)
        .single()

      if (projectError || !project) {
        l.error({
          key: 'initialize_workspace:project_not_found',
          error: projectError,
          projectId,
          userId: session.user.id,
        })
        return returnServerError('Project not found')
      }

      const typedProject = project as Tables<'projects'>

      // Skip if already has active sandbox
      if (typedProject.sandbox_id && typedProject.sandbox_status === 'active') {
        l.info({
          key: 'initialize_workspace:already_initialized',
          projectId,
          sandboxId: typedProject.sandbox_id,
          userId: session.user.id,
        })
        return {
          project: typedProject,
          alreadyInitialized: true,
          sandboxId: typedProject.sandbox_id,
          sandboxUrl: typedProject.default_domain,
          message: 'Workspace already initialized',
        }
      }

      // Use atomic update to prevent race conditions - only proceed if sandbox_status is null or failed
      // Use sandbox_metadata to track initialization state since 'initializing' is not allowed in sandbox_status
      const initializationMetadata = {
        initializing: true,
        startedAt: new Date().toISOString(),
        userId: session.user.id,
      }

      const { data: lockResult, error: lockError } = await supabase
        .from('projects')
        .update({
          sandbox_metadata: initializationMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .eq('account_id', session.user.id)
        .is('sandbox_id', null) // Only update if sandbox_id is still null
        .select()
        .single()

      if (lockError || !lockResult) {
        // Another process is already initializing or project already has sandbox
        l.info({
          key: 'initialize_workspace:concurrent_initialization',
          projectId,
          userId: session.user.id,
          lockError: lockError?.message,
        })

        // Re-fetch to get current state
        const { data: currentProject } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .eq('account_id', session.user.id)
          .single()

        const typedCurrentProject = currentProject as Tables<'projects'>
        if (typedCurrentProject?.sandbox_id && typedCurrentProject.sandbox_status === 'active') {
          return {
            project: typedCurrentProject,
            alreadyInitialized: true,
            sandboxId: typedCurrentProject.sandbox_id,
            sandboxUrl: typedCurrentProject.default_domain,
            message: 'Workspace already initialized by another process',
          }
        }

        return returnServerError('Another initialization is already in progress')
      }

      // Create sandbox using the centralized manager (single source of truth)
      let sandboxId: string
      let sandboxUrl: string
      try {
        // Initialize database sync first
        sandboxManager.initializeDatabaseSync(supabase)

        // Create sandbox through manager - this is the ONLY place sandboxes are created
        // Pass project ID to prevent duplicate creation
        const sandboxInfo = await sandboxManager.createNewSandbox(projectId)

        // Initialize Vite React app inside sandbox
        await sandboxInfo.provider.setupViteApp()

        sandboxId = sandboxInfo.sandboxId
        sandboxUrl = sandboxInfo.url
      } catch (sandboxError) {
        l.error({
          key: 'initialize_workspace:sandbox_failed',
          error: sandboxError,
          projectId,
          template: typedProject.template,
          userId: session.user.id,
        })

        // Update project status to failed
        await supabase
          .from('projects')
          .update({
            sandbox_status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId)

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
        key: 'initialize_workspace:sandbox_created',
        projectId,
        sandboxId,
        userId: session.user.id,
      })

      // Update project with sandbox information
      const { data: updatedProject, error: updateError } = await supabase
        .from('projects')
        .update({
          sandbox_id: sandboxId,
          sandbox_status: 'active',
          sandbox_last_active: new Date().toISOString(),
          default_domain: sandboxUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select()
        .single()

      if (updateError) {
        l.error({
          key: 'initialize_workspace:update_failed',
          error: updateError,
          projectId,
          sandboxId,
          userId: session.user.id,
        })
        return returnServerError('Failed to update project with sandbox information')
      }

      l.info({
        key: 'initialize_workspace:success',
        projectId,
        sandboxId,
        userId: session.user.id,
      })

      return {
        project: updatedProject,
        sandboxId,
        sandboxUrl,
        message: 'Workspace initialized successfully',
      }
    } catch (error: unknown) {
      l.error({
        key: 'initialize_workspace:failed',
        error,
        projectId,
        userId: session.user.id,
      })

      // Update project status to failed
      try {
        await supabase
          .from('projects')
          .update({
            sandbox_status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId)
      } catch (statusUpdateError) {
        l.error({
          key: 'initialize_workspace:status_update_failed',
          error: statusUpdateError,
          projectId,
          userId: session.user.id,
        })
      }

      // Provide more specific error message
      if (error instanceof Error) {
        return returnServerError(`Failed to initialize workspace: ${error.message}`)
      }

      return returnServerError('Failed to initialize workspace: Unknown error')
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
