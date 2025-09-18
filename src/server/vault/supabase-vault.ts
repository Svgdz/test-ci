import 'server-cli-only'

import { supabaseAdmin } from '@/lib/clients/supabase/admin'
import { l } from '@/lib/clients/logger'

// Type definitions for Supabase client and vault operations
export interface SupabaseRpcClient {
  rpc: (
    fn: string,
    params: Record<string, unknown>
  ) => Promise<{
    data: unknown
    error: { message: string } | null
  }>
}

interface SupabaseVaultResponse {
  data: unknown
  error: { message: string } | null
}

interface VaultErrorType {
  message: string
}

/**
 * Supabase Vault utility for managing project secrets
 * Uses Supabase's built-in vault functionality for secure secret storage
 */

export interface VaultSecret {
  name: string
  value: string
  description?: string
}

export interface VaultSecretResponse {
  name: string
  value: string
  created_at: string
  updated_at: string
}

/**
 * Create a new secret in Supabase Vault
 */
export async function createVaultSecret(
  secretName: string,
  secretValue: string,
  description?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    l.info({
      key: 'vault:create_secret:start',
      secretName,
      hasValue: !!secretValue,
    })

    // Use Supabase's vault functionality
    // Note: Supabase Vault is accessed through the admin client
    const { data: vaultData, error } = (await supabaseAdmin.functions.invoke('vault-create', {
      body: {
        name: secretName,
        value: secretValue,
        description: description || `Secret for ${secretName}`,
      },
    })) as SupabaseVaultResponse

    if (error) {
      l.error({
        key: 'vault:create_secret:failed',
        error: error as VaultErrorType,
        secretName,
      })
      return { success: false, error: (error as VaultErrorType).message }
    }

    l.info({
      key: 'vault:create_secret:success',
      secretName,
      data: vaultData,
    })

    return { success: true }
  } catch (error) {
    l.error({
      key: 'vault:create_secret:exception',
      error,
      secretName,
    })
    return { success: false, error: 'Failed to create vault secret' }
  }
}

/**
 * Retrieve a secret from Supabase Vault
 */
export async function getVaultSecret(secretName: string): Promise<{
  success: boolean
  data?: VaultSecretResponse
  error?: string
}> {
  try {
    l.debug({
      key: 'vault:get_secret:start',
      secretName,
    })

    const { data, error } = (await supabaseAdmin.functions.invoke('vault-get', {
      body: { name: secretName },
    })) as SupabaseVaultResponse

    if (error) {
      l.error({
        key: 'vault:get_secret:failed',
        error: error as VaultErrorType,
        secretName,
      })
      return { success: false, error: (error as VaultErrorType).message }
    }

    l.debug({
      key: 'vault:get_secret:success',
      secretName,
    })

    return { success: true, data: data as VaultSecretResponse }
  } catch (error) {
    l.error({
      key: 'vault:get_secret:exception',
      error,
      secretName,
    })
    return { success: false, error: 'Failed to retrieve vault secret' }
  }
}

/**
 * Update a secret in Supabase Vault
 */
export async function updateVaultSecret(
  secretName: string,
  secretValue: string,
  description?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    l.info({
      key: 'vault:update_secret:start',
      secretName,
      hasValue: !!secretValue,
    })

    const { data: vaultData, error } = (await supabaseAdmin.functions.invoke('vault-update', {
      body: {
        name: secretName,
        value: secretValue,
        description: description || `Secret for ${secretName}`,
      },
    })) as SupabaseVaultResponse

    if (error) {
      l.error({
        key: 'vault:update_secret:failed',
        error: error as VaultErrorType,
        secretName,
      })
      return { success: false, error: (error as VaultErrorType).message }
    }

    l.info({
      key: 'vault:update_secret:success',
      secretName,
      data: vaultData,
    })

    return { success: true }
  } catch (error) {
    l.error({
      key: 'vault:update_secret:exception',
      error,
      secretName,
    })
    return { success: false, error: 'Failed to update vault secret' }
  }
}

/**
 * Delete a secret from Supabase Vault
 */
export async function deleteVaultSecret(secretName: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    l.info({
      key: 'vault:delete_secret:start',
      secretName,
    })

    const { data: vaultData, error } = (await supabaseAdmin.functions.invoke('vault-delete', {
      body: { name: secretName },
    })) as SupabaseVaultResponse

    if (error) {
      l.error({
        key: 'vault:delete_secret:failed',
        error: error as VaultErrorType,
        secretName,
      })
      return { success: false, error: (error as VaultErrorType).message }
    }

    l.info({
      key: 'vault:delete_secret:success',
      secretName,
      data: vaultData,
    })

    return { success: true }
  } catch (error) {
    l.error({
      key: 'vault:delete_secret:exception',
      error,
      secretName,
    })
    return { success: false, error: 'Failed to delete vault secret' }
  }
}

/**
 * List all secrets for a project
 */
export async function listVaultSecrets(projectId: string): Promise<{
  success: boolean
  data?: VaultSecretResponse[]
  error?: string
}> {
  try {
    l.debug({
      key: 'vault:list_secrets:start',
      projectId,
    })

    const { data, error } = (await supabaseAdmin.functions.invoke('vault-list', {
      body: { projectId },
    })) as SupabaseVaultResponse

    if (error) {
      l.error({
        key: 'vault:list_secrets:failed',
        error: error as VaultErrorType,
        projectId,
      })
      return { success: false, error: (error as VaultErrorType).message }
    }

    l.debug({
      key: 'vault:list_secrets:success',
      projectId,
      count: (data as unknown[])?.length || 0,
    })

    return { success: true, data: data as VaultSecretResponse[] }
  } catch (error) {
    l.error({
      key: 'vault:list_secrets:exception',
      error,
      projectId,
    })
    return { success: false, error: 'Failed to list vault secrets' }
  }
}

/**
 * Generate a unique secret name for a project
 */
export function generateSecretName(projectId: string, key: string): string {
  return `project-${projectId}-${key.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
}

/**
 * Supabase Vault Manager using encrypted storage in database
 * This implementation stores secrets encrypted in the database using Supabase's built-in encryption
 */
export class SupabaseVaultManager {
  private projectId: string
  private supabase: SupabaseRpcClient

  constructor(projectId: string, supabaseClient?: SupabaseRpcClient) {
    this.projectId = projectId
    this.supabase = supabaseClient || (supabaseAdmin as unknown as SupabaseRpcClient)
  }

  /**
   * Create a secret using Supabase's built-in vault (properly encrypted)
   * This works with both the Supabase Vault dashboard and programmatic access
   */
  async createSecret(key: string, value: string): Promise<{ success: boolean; error?: string }> {
    try {
      const secretName = generateSecretName(this.projectId, key)

      l.info({
        key: 'vault_manager:create_secret',
        secretName,
        projectId: this.projectId,
      })

      // Use Supabase's vault.create_secret() function directly
      // This integrates properly with the Supabase Vault dashboard
      const { data: secretId, error } = await this.supabase.rpc('vault_create_secret', {
        secret_value: value,
        secret_name: secretName,
        secret_description: `Project: ${this.projectId} | Key: ${key}`,
      })

      if (error) {
        l.error({
          key: 'vault_manager:create_secret:failed',
          error,
          projectId: this.projectId,
          secretKey: key,
        })
        return { success: false, error: error.message }
      }

      l.info({
        key: 'vault_manager:create_secret:success',
        secretId,
        secretName,
        projectId: this.projectId,
      })

      return { success: true }
    } catch (error) {
      l.error({
        key: 'vault_manager:create_secret:failed',
        error,
        projectId: this.projectId,
        secretKey: key,
      })
      return { success: false, error: 'Failed to create secret' }
    }
  }

  /**
   * Get a secret value using Supabase's vault system
   * This works with secrets created both via code and the Supabase Vault dashboard
   */
  async getSecret(key: string): Promise<{ success: boolean; value?: string; error?: string }> {
    try {
      const secretName = generateSecretName(this.projectId, key)

      l.debug({
        key: 'vault_manager:get_secret',
        secretName,
        projectId: this.projectId,
      })

      // Use our wrapper function that includes access control
      const { data, error } = await this.supabase.rpc('vault_get_secret', {
        secret_name: secretName,
      })

      if (error) {
        l.error({
          key: 'vault_manager:get_secret:failed',
          error,
          projectId: this.projectId,
          secretKey: key,
        })
        return { success: false, error: error.message }
      }

      return { success: true, value: data as string }
    } catch (error) {
      l.error({
        key: 'vault_manager:get_secret:failed',
        error,
        projectId: this.projectId,
        secretKey: key,
      })
      return { success: false, error: 'Failed to retrieve secret' }
    }
  }

  /**
   * Update a secret value using Supabase's vault system
   */
  async updateSecret(key: string, value: string): Promise<{ success: boolean; error?: string }> {
    try {
      const secretName = generateSecretName(this.projectId, key)

      l.info({
        key: 'vault_manager:update_secret',
        secretName,
        projectId: this.projectId,
      })

      const { error } = await this.supabase.rpc('vault_update_secret', {
        secret_name: secretName,
        secret_value: value,
      })

      if (error) {
        l.error({
          key: 'vault_manager:update_secret:failed',
          error,
          projectId: this.projectId,
          secretKey: key,
        })
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      l.error({
        key: 'vault_manager:update_secret:failed',
        error,
        projectId: this.projectId,
        secretKey: key,
      })
      return { success: false, error: 'Failed to update secret' }
    }
  }

  /**
   * Delete a secret using Supabase's vault system
   */
  async deleteSecret(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      const secretName = generateSecretName(this.projectId, key)

      l.info({
        key: 'vault_manager:delete_secret',
        secretName,
        projectId: this.projectId,
      })

      const { error } = await this.supabase.rpc('vault_delete_secret', {
        secret_name: secretName,
      })

      if (error) {
        l.error({
          key: 'vault_manager:delete_secret:failed',
          error,
          projectId: this.projectId,
          secretKey: key,
        })
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      l.error({
        key: 'vault_manager:delete_secret:failed',
        error,
        projectId: this.projectId,
        secretKey: key,
      })
      return { success: false, error: 'Failed to delete secret' }
    }
  }
}
