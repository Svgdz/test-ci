/**
 * Environment Variable Checker
 * Validates required environment variables and provides helpful error messages
 */

interface EnvCheckResult {
  isValid: boolean
  missing: string[]
  warnings: string[]
}

/**
 * Check if all required environment variables are set
 */
export function checkRequiredEnvVars(): EnvCheckResult {
  const required = {
    // Supabase Configuration
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    // E2B Configuration
    E2B_API_KEY: process.env.E2B_API_KEY,
  }

  const optional = {
    // Logging
    LOKI_HOST: process.env.LOKI_HOST,
    LOKI_USERNAME: process.env.LOKI_USERNAME,
    LOKI_PASSWORD: process.env.LOKI_PASSWORD,
  }

  const missing: string[] = []
  const warnings: string[] = []

  // Check required variables
  Object.entries(required).forEach(([key, value]) => {
    if (!value || value === 'undefined' || value === '') {
      missing.push(key)
    }
  })

  // Check optional variables for warnings
  if (optional.LOKI_HOST && (!optional.LOKI_USERNAME || !optional.LOKI_PASSWORD)) {
    warnings.push('LOKI_HOST is set but LOKI_USERNAME or LOKI_PASSWORD is missing')
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
  }
}

/**
 * Throw an error with helpful message if environment is not configured
 */
export function ensureEnvironmentConfigured(): void {
  const result = checkRequiredEnvVars()

  if (!result.isValid) {
    // Only log concise details to avoid leaking secrets
    const missingList = result.missing.join(', ')
    const warningsList = result.warnings.join('; ')
    const message = warningsList
      ? `Missing required environment variables: ${missingList}. Warnings: ${warningsList}`
      : `Missing required environment variables: ${missingList}`
    console.error(message)
    throw new Error('Environment not configured')
  }
}
