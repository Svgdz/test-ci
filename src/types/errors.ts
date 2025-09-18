// Types

export type AIBEXXErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNAUTHORIZED'
  | 'INVALID_PARAMETERS'
  | 'INTERNAL_SERVER_ERROR'
  | 'API_ERROR'
  | 'INVALID_API_KEY'
  | 'UNKNOWN'

export class AIBEXXError extends Error {
  public code: AIBEXXErrorCode

  constructor(code: AIBEXXErrorCode, message: string) {
    super(message)
    this.name = 'AIBEXXError'
    this.code = code
  }
}

// Errors

export const UnauthenticatedError = () =>
  new AIBEXXError('UNAUTHENTICATED', 'User not authenticated')

export const UnauthorizedError = (message: string) => new AIBEXXError('UNAUTHORIZED', message)

export const InvalidApiKeyError = (message: string) => new AIBEXXError('INVALID_API_KEY', message)

export const InvalidParametersError = (message: string) =>
  new AIBEXXError('INVALID_PARAMETERS', message)

export const ApiError = (message: string) => new AIBEXXError('API_ERROR', message)

export const UnknownError = (message?: string) =>
  new AIBEXXError(
    'UNKNOWN',
    message ??
      'An Unexpected Error Occurred, please try again. If the problem persists, please contact support.'
  )
