interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  metadata?: {
    sandboxId?: string
    editedFiles?: string[]
  }
}

interface ConversationEdit {
  timestamp: number
  userRequest: string
  editType: string
  targetFiles: string[]
  confidence: number
  outcome: 'success' | 'failure'
}

interface ConversationState {
  conversationId: string
  startedAt: number
  lastUpdated: number
  context: {
    messages: ConversationMessage[]
    edits: ConversationEdit[]
    projectEvolution: {
      majorChanges: Array<{ timestamp: number; description: string; filesAffected: string[] }>
    }
    userPreferences: Record<string, unknown>
  }
}

type ParsedFile = { path: string; content: string }

interface ParsedResponse {
  explanation: string
  template: string
  files: ParsedFile[]
  packages: string[]
  commands: string[]
  structure: string | null
}

export interface ApplyAiCodeStreamInput {
  prompt: string
  model?: string
  context?: {
    sandboxId?: string
    currentFiles?: Record<string, unknown>
    structure?: string
    userId?: string
    conversationContext?: {
      scrapedWebsites?: Array<{ url: string; timestamp: number; content: unknown }>
      currentProject?: string
    }
    visualEditorContext?: {
      selectedElement: {
        selector: string
        elementType: string
        textContent: string
        bounds: { x: number; y: number; width: number; height: number }
        componentPath?: string
        componentName?: string
      }
      isVisualEdit: boolean
    }
  }
  isEdit?: boolean
  packages?: string[]
  sandboxId?: string
}

export type ProgressEvent =
  | { type: 'start'; message: string; totalSteps: number }
  | { type: 'step'; step: number; message: string; packages?: string[] }
  | { type: 'file-progress'; current: number; total: number; fileName: string; action: 'creating' }
  | { type: 'file-complete'; fileName: string; action: 'created' | 'updated' }
  | { type: 'file-error'; fileName: string; error: string }
  | {
      type: 'command-progress'
      current: number
      total: number
      command: string
      action: 'executing'
    }
  | { type: 'command-output'; command: string; output: string; stream: 'stdout' | 'stderr' }
  | { type: 'command-complete'; command: string; exitCode: number; success: boolean }
  | { type: 'command-error'; command: string; error: string }
  | { type: 'package-progress'; message?: string; installedPackages?: string[] }
  | { type: 'warning'; message: string }
  | { type: 'error'; error: string }
  | {
      type: 'complete'
      results: ApplyAiCodeStreamResult['results']
      explanation: string
      structure: string | null
      message: string
    }

export interface ApplyAiCodeStreamResult {
  success: boolean
  results: {
    filesCreated: string[]
    filesUpdated: string[]
    packagesInstalled: string[]
    packagesAlreadyInstalled: string[]
    packagesFailed: string[]
    commandsExecuted: string[]
    errors: string[]
  }
  explanation: string
  structure: string | null
  parsedFiles: ParsedFile[]
  message: string
  thinkingAnalysis?: string
}

export type { ConversationMessage, ConversationEdit, ConversationState, ParsedFile, ParsedResponse }
