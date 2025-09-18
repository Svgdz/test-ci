import { VERBOSE } from '@/configs/flags'
import { pino } from 'pino'
import type { LokiOptions } from 'pino-loki'

const REDACTION_PATHS = [
  'password',
  'confirmPassword',
  'accessToken',
  'secret',
  'token',
  '*.password',
  '*.confirmPassword',
  '*.accessToken',
  '*.secret',
  '*.token',
  '*.sandboxIds',
  '*.*.password',
  '*.*.confirmPassword',
  '*.*.accessToken',
  '*.*.secret',
  '*.*.token',
]

const createLogger = () => {
  const baseConfig = {
    level: VERBOSE ? 'debug' : 'info',
    redact: {
      paths: REDACTION_PATHS,
      censor: '[Redacted]',
    },
  }

  if (process.env.NEXT_RUNTIME === 'edge' || typeof process === 'undefined') {
    return pino(baseConfig)
  }

  if (process.env.LOKI_HOST) {
    const lokiNeedsBasicAuth = process.env.LOKI_USERNAME && process.env.LOKI_PASSWORD
    const lokiVercelLabels = process.env.VERCEL_ENV
      ? ({
          vercel_env: process.env.VERCEL_ENV,
          vercel_url: process.env.VERCEL_URL,
          vercel_branch_url: process.env.VERCEL_BRANCH_URL,
          vercel_project_production_url: process.env.VERCEL_PROJECT_PRODUCTION_URL,
        } as Record<string, string>)
      : {}

    try {
      const logger = pino({
        ...baseConfig,
        transport: {
          target: 'pino-loki',
          options: {
            batching: true,
            interval: 1,
            timeout: 25000,
            labels: {
              service_name: process.env.LOKI_SERVICE_NAME || 'e2b-dashboard',
              env: process.env.NODE_ENV || 'development',
              ...lokiVercelLabels,
            },
            host: process.env.LOKI_HOST,
            basicAuth: lokiNeedsBasicAuth
              ? {
                  username: process.env.LOKI_USERNAME!,
                  password: process.env.LOKI_PASSWORD!,
                }
              : undefined,
            convertArrays: true,
          } satisfies LokiOptions,
        },
      })

      return logger
    } catch (error) {
      console.error('Failed to create Loki transport, falling back to basic logger:', error)
      return pino(baseConfig)
    }
  }

  return pino(baseConfig)
}

const logger = createLogger()

export { logger }
