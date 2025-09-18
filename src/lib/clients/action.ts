import { UnknownError } from '@/types/errors'
import { createSafeActionClient } from 'next-safe-action'
import { serializeError } from 'serialize-error'
import { z } from 'zod'
import { ActionError, flattenClientInputValue } from '../utils/action'
import { checkAuthenticated } from '../utils/server'
import { l } from './logger'

/*
 * Creates a configured next-safe-action client with error handling and logging middleware
 * This ensures consistent logging, type safety, and security without repeating code in each action
 */
export const actionClient = createSafeActionClient({
  handleServerError(e) {
    if (e instanceof ActionError) {
      return e.message
    }

    const sE = serializeError(e)

    l.error(
      { key: 'action_client:unexpected_server_error', error: sE },
      `${sE.name && `${sE.name}: `} ${sE.message || 'Unknown error'}`
    )

    return UnknownError().message
  },
  defineMetadataSchema() {
    return z
      .object({
        actionName: z.string().optional(),
        serverFunctionName: z.string().optional(),
      })
      .refine((data) => {
        if (!data.actionName && !data.serverFunctionName) {
          return 'actionName or serverFunctionName is required in definition metadata'
        }
        return true
      })
  },
  defaultValidationErrorsShape: 'flattened',
}).use(async ({ next, clientInput, metadata }) => {
  const actionOrFunctionName =
    metadata?.serverFunctionName || metadata?.actionName || 'Unknown action'

  const type = metadata?.serverFunctionName ? 'function' : 'action'
  const name = actionOrFunctionName

  const startTime = performance.now()

  const result = await next()

  const duration = performance.now() - startTime

  const baseLogPayload = {
    server_function_type: type,
    server_function_name: name,
    server_function_input: clientInput,
    server_function_duration_ms: duration.toFixed(3),
    user_id: flattenClientInputValue(clientInput, 'userId'),
  }

  const error: unknown = result.serverError || result.validationErrors || result.success === false

  if (error) {
    const sE = serializeError(error as Error)

    l.error(
      {
        key: 'action_client:failure',
        ...baseLogPayload,
        error: sE,
      },
      `${type} ${name} failed in ${baseLogPayload.server_function_duration_ms}ms: ${typeof sE === 'string' ? sE : 'Unknown error'}`
    )
  } else {
    l.info(
      {
        key: `action_client:success`,
        ...baseLogPayload,
      },
      `${type} ${name} succeeded in ${baseLogPayload.server_function_duration_ms}ms`
    )
  }

  return result
})

export const authActionClient = actionClient.use(async ({ next }) => {
  const { user, session, supabase } = await checkAuthenticated()

  return next({ ctx: { user, session, supabase } })
})
