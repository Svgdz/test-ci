/**
 * Universal logger that picks the correct implementation for the current runtime (Node, Edge, Browser).
 * In Node & Browser we return the real pino instance.
 * In Edge we fall back to the minimal JSON logger implemented in `logger.edge.ts`.
 */

import { Logger } from 'pino'

const loggerImpl = (() => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('./logger.node') as { logger: Logger }).logger
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./logger.edge') as { logger: Logger }).logger
})()

export const l = loggerImpl
export const logger = loggerImpl
export default loggerImpl
