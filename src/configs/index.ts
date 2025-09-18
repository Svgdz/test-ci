import { e2bConfig } from './e2b'
import * as api from './api'
import * as files from './files'
import * as llm from './llm'
import * as ui from './ui'
import * as codeApplication from './code-application'
import * as urls from './urls'
import * as flags from './flags'

export const appConfig = {
  e2b: e2bConfig,
  api,
  files,
  llm,
  ui,
  codeApplication,
  urls,
  flags,
} as const

export type AppConfig = typeof appConfig

export function getConfig<K extends keyof AppConfig>(key: K): AppConfig[K] {
  return appConfig[key]
}

export function getConfigValue<T = unknown>(path: string): T | undefined {
  return path.split('.').reduce<unknown>((obj, key) => {
    if (obj && typeof obj === 'object' && key in (obj as Record<string, unknown>)) {
      return (obj as Record<string, unknown>)[key]
    }
    return undefined
  }, appConfig) as T | undefined
}
