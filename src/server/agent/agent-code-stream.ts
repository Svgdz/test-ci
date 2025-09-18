import { SandboxFactory } from '@/server/sandbox/factory'
import { sandboxManager } from '@/server/sandbox/manager'
import type { SandboxProvider } from '@/server/sandbox/types'
import { selectFilesForEdit, getFileContents, formatFilesForAI } from '@/lib/utils/context-selector'
import { parseTypeScriptFile } from '@/lib/utils/file-parser'
import { analyzeEditIntent } from '@/lib/utils/intent-analyzer'
import { getEditExamplesPrompt } from './edit-example'
import {
  executeSearchPlan,
  formatSearchResultsForAI,
  selectTargetFile,
  type SearchPlan,
} from './file-search-executor'
import type { FileManifest } from '@/types/file-manifest'
import { EditType } from '@/types/file-manifest'
import { streamText } from 'ai'
import type {
  ConversationMessage,
  ConversationEdit,
  ConversationState,
  ParsedFile,
  ParsedResponse,
  ApplyAiCodeStreamInput,
  ProgressEvent,
  ApplyAiCodeStreamResult,
} from './types'

/**
 * Convert EditIntent to SearchPlan for file-search-executor
 * Creates targeted search terms based on edit intent
 */
function createSearchPlan(editIntent: any, prompt: string): SearchPlan {
  const searchTerms: string[] = []
  const regexPatterns: string[] = []

  // Extract key terms from the user prompt
  const words = prompt.toLowerCase().split(/\s+/)

  // Add specific search terms based on edit type
  switch (editIntent.type) {
    case EditType.UPDATE_STYLE:
      // Look for className, style, CSS-related terms
      searchTerms.push('className', 'style', 'bg-', 'text-', 'border-', 'shadow-')
      regexPatterns.push('className\\s*=\\s*["\']([^"\']*)["\']')
      break

    case EditType.UPDATE_COMPONENT:
      // Look for component definitions and JSX
      searchTerms.push('function', 'const', 'export', 'return')
      regexPatterns.push('(function|const)\\s+\\w+', 'export\\s+(default\\s+)?\\w+')
      break

    case EditType.FIX_ISSUE:
      // Look for specific text content or element types that need fixing
      const textMatches = prompt.match(/"([^"]+)"|'([^']+)'/)
      if (textMatches) {
        searchTerms.push(textMatches[1] || textMatches[2])
      }
      searchTerms.push('<button', '<div', '<span', '<p', 'error', 'issue', 'problem')
      break

    case EditType.ADD_FEATURE:
      // Look for where to insert new functionality
      searchTerms.push('return', 'render', 'jsx', 'tsx')
      break

    default:
      // General search terms
      searchTerms.push(...words.filter((w) => w.length > 3))
  }

  // Add fallback search with broader terms
  const fallbackTerms = words.filter(
    (w) => w.length > 2 && !['the', 'and', 'for', 'with'].includes(w)
  )

  return {
    editType: editIntent.type,
    reasoning: `Search for ${editIntent.type} in files: ${editIntent.targetFiles.join(', ')}`,
    searchTerms: [...new Set(searchTerms)],
    regexPatterns,
    fileTypesToSearch: ['.tsx', '.jsx', '.ts', '.js'],
    expectedMatches: 1,
    fallbackSearch: {
      terms: fallbackTerms,
      patterns: ['\\w+'],
    },
  }
}

/**
 * Load AI provider based on model prefix
 * Returns configured provider instance for streaming
 */
async function getAIProvider(model: string) {
  const isAnthropic = model.startsWith('anthropic/')
  const isGoogle = model.startsWith('google/')
  const isOpenAI = model.startsWith('openai/')

  console.log(`[getAIProvider] Loading provider for model: ${model}`)
  console.log(
    `[getAIProvider] Provider type: ${isAnthropic ? 'Anthropic' : isOpenAI ? 'OpenAI' : isGoogle ? 'Google' : 'Unknown'}`
  )

  try {
    if (isAnthropic) {
      console.log(`[getAIProvider] Loading Anthropic provider...`)
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      const apiKey = process.env.ANTHROPIC_API_KEY
      console.log(`[getAIProvider] Anthropic API key available: ${!!apiKey}`)

      return createAnthropic({
        apiKey,
        baseURL: process.env.ANTHROPIC_BASE_URL,
      })
    } else if (isOpenAI) {
      console.log(`[getAIProvider] Loading OpenAI provider...`)
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
      })
    } else if (isGoogle) {
      console.log(`[getAIProvider] Loading Google provider...`)
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      return createGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
      })
    } else {
      throw new Error(
        `Unsupported model provider for model: ${model}. Supported providers: anthropic/, openai/, google/`
      )
    }
  } catch (error) {
    console.error(`[getAIProvider] Error loading provider:`, error)
    throw new Error(
      `AI provider not available: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

declare global {
  // eslint-disable-next-line no-var
  var conversationState: ConversationState | null
}

/**
 * Extract package imports from code content using file-parser utility
 * Returns array of npm package names to install
 */
function extractPackagesFromCode(content: string): string[] {
  const packages: string[] = []
  const fileInfo = parseTypeScriptFile(content, 'temp.tsx')

  if (fileInfo.imports) {
    for (const importInfo of fileInfo.imports) {
      const importPath = importInfo.source
      if (
        !importPath.startsWith('.') &&
        !importPath.startsWith('/') &&
        importPath !== 'react' &&
        importPath !== 'react-dom' &&
        !importPath.startsWith('@/')
      ) {
        const packageName = importPath.startsWith('@')
          ? importPath.split('/').slice(0, 2).join('/')
          : importPath.split('/')[0]

        if (!packages.includes(packageName)) {
          packages.push(packageName)
        }
      }
    }
  }
  return packages
}

/**
 * Parse AI response into structured file data
 * Extracts files, packages, commands from AI output
 */
function parseAIResponse(response: string): ParsedResponse {
  const sections: ParsedResponse = {
    files: [],
    commands: [],
    packages: [],
    structure: null,
    explanation: '',
    template: '',
  }

  const fileMap = new Map<string, { content: string; isComplete: boolean }>()
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g
  let match: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1]
    const content = match[2].trim()
    const hasClosingTag = response
      .substring(match.index, match.index + match[0].length)
      .includes('</file>')
    const existing = fileMap.get(filePath)
    let shouldReplace = false
    if (!existing) shouldReplace = true
    else if (!existing.isComplete && hasClosingTag) shouldReplace = true
    else if (existing.isComplete && hasClosingTag && content.length > existing.content.length)
      shouldReplace = true
    else if (!existing.isComplete && !hasClosingTag && content.length > existing.content.length)
      shouldReplace = true

    if (shouldReplace) {
      if (
        content.includes('...') &&
        !content.includes('...props') &&
        !content.includes('...rest')
      ) {
        if (!existing) fileMap.set(filePath, { content, isComplete: hasClosingTag })
      } else {
        fileMap.set(filePath, { content, isComplete: hasClosingTag })
      }
    }
  }

  for (const [path, { content, isComplete }] of fileMap.entries()) {
    sections.files.push({ path, content })
    const filePackages = extractPackagesFromCode(content)
    for (const pkg of filePackages)
      if (!sections.packages.includes(pkg)) sections.packages.push(pkg)
  }

  const markdownFileRegex = /```(?:file )?path="([^"]+)"\n([\s\S]*?)```/g
  // eslint-disable-next-line no-cond-assign
  while ((match = markdownFileRegex.exec(response)) !== null) {
    const filePath = match[1]
    const content = match[2].trim()
    sections.files.push({ path: filePath, content })
    const filePackages = extractPackagesFromCode(content)
    for (const pkg of filePackages)
      if (!sections.packages.includes(pkg)) sections.packages.push(pkg)
  }

  const generatedFilesMatch = response.match(/Generated Files?:\s*([^\n]+)/i)
  if (generatedFilesMatch) {
    const filesList = generatedFilesMatch[1]
      .split(',')
      .map((f) => f.trim())
      .filter((f) => /\.(jsx?|tsx?|css|json|html)$/.test(f))
    for (const fileName of filesList) {
      const fileContentRegex = new RegExp(
        `${fileName}[\\n\\r\\sS]*?(?:import[\\sS]+?)(?=Generated Files:|Applying code|$)`,
        'i'
      )
      const fileContentMatch = response.match(fileContentRegex)
      if (fileContentMatch) {
        const codeMatch = fileContentMatch[0].match(/^(import[\s\S]+)$/m)
        if (codeMatch) {
          const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`
          const code = codeMatch[1].trim()
          sections.files.push({ path: filePath, content: code })
          const filePackages = extractPackagesFromCode(code)
          for (const pkg of filePackages)
            if (!sections.packages.includes(pkg)) sections.packages.push(pkg)
        }
      }
    }
  }

  const codeBlockRegex = /```(?:jsx?|tsx?|javascript|typescript)?\n([\s\S]*?)```/g
  // eslint-disable-next-line no-cond-assign
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const content = match[1].trim()
    const fileNameMatch = content.match(/\/\/\s*(?:File:|Component:)\s*([^\n]+)/)
    if (fileNameMatch) {
      const fileName = fileNameMatch[1].trim()
      const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`
      if (!sections.files.some((f) => f.path === filePath)) {
        sections.files.push({ path: filePath, content })
        const filePackages = extractPackagesFromCode(content)
        for (const pkg of filePackages)
          if (!sections.packages.includes(pkg)) sections.packages.push(pkg)
      }
    }
  }

  const cmdRegex = /<command>(.*?)<\/command>/g
  // eslint-disable-next-line no-cond-assign
  while ((match = cmdRegex.exec(response)) !== null) sections.commands.push(match[1].trim())

  const pkgRegex = /<package>(.*?)<\/package>/g
  // eslint-disable-next-line no-cond-assign
  while ((match = pkgRegex.exec(response)) !== null) sections.packages.push(match[1].trim())

  const packagesRegex = /<packages>([\s\S]*?)<\/packages>/
  const packagesMatch = response.match(packagesRegex)
  if (packagesMatch) {
    const packagesContent = packagesMatch[1].trim()
    const packagesList = packagesContent
      .split(/[\n,]+/)
      .map((pkg) => pkg.trim())
      .filter((pkg) => pkg.length > 0)
    for (const pkg of packagesList)
      if (!sections.packages.includes(pkg)) sections.packages.push(pkg)
  }

  const structureMatch = response.match(/<structure>([\s\S]*?)<\/structure>/)
  if (structureMatch) sections.structure = structureMatch[1].trim()

  const explanationMatch = response.match(/<explanation>([\s\S]*?)<\/explanation>/)
  if (explanationMatch) sections.explanation = explanationMatch[1].trim()

  const templateMatch = response.match(/<template>(.*?)<\/template>/)
  if (templateMatch) sections.template = templateMatch[1].trim()

  return sections
}

/**
 * Ensure sandbox provider is available
 * Creates new sandbox or reconnects to existing one
 */
async function ensureProviderForSandbox(sandboxId?: string): Promise<SandboxProvider> {
  const fromManager = sandboxId
    ? sandboxManager.getProvider(sandboxId)
    : sandboxManager.getActiveProvider()
  if (fromManager) return fromManager

  if (sandboxId) {
    try {
      // Try to reconnect to existing sandbox
      const provider = SandboxFactory.create()

      // For E2B, we need to reconnect to the existing sandbox
      // This is a simplified approach - in production you'd want proper reconnection logic
      const hasReconnect = (
        p: SandboxProvider
      ): p is SandboxProvider & { reconnect: (id: string) => Promise<boolean> } => {
        return (
          typeof (p as { reconnect?: (id: string) => Promise<boolean> }).reconnect === 'function'
        )
      }

      if (hasReconnect(provider)) {
        const reconnected = await provider.reconnect(sandboxId)
        if (reconnected) {
          sandboxManager.registerSandbox(sandboxId, provider)
          sandboxManager.setActiveSandbox(sandboxId)
          return provider
        }
      }

      // If reconnection fails or isn't supported, create new sandbox
      const info = await provider.createSandbox()
      await provider.setupViteApp()
      sandboxManager.registerSandbox(info.sandboxId, provider)
      sandboxManager.setActiveSandbox(info.sandboxId)
      return provider
    } catch (e) {
      const err = e as Error
      throw new Error(`Failed to prepare provider for sandbox ${sandboxId}: ${err.message}`)
    }
  }

  // No sandboxId provided - create new sandbox
  const provider = SandboxFactory.create()
  const info = await provider.createSandbox()
  await provider.setupViteApp()
  sandboxManager.registerSandbox(info.sandboxId, provider)
  sandboxManager.setActiveSandbox(info.sandboxId)
  return provider
}

/**
 * Analyze user request and create implementation plan
 * Only runs for new projects, not edits or visual edits
 */
async function performThinkingPhase(
  prompt: string,
  model: string,
  isEdit: boolean,
  _context?: ApplyAiCodeStreamInput['context']
): Promise<{ analysis: string; enhancedPrompt: string }> {
  console.log(`[performThinkingPhase] Analyzing user request...`)

  const thinkingSystemPrompt = `You are an expert software architect and product manager. Analyze the user's request and provide a comprehensive implementation plan.

Your response should follow this exact format:

**Approach Statement:** [One sentence describing your overall approach]

**Core Features:** [List 4-8 essential features this implementation needs]
- Feature 1: Brief description
- Feature 2: Brief description
- Feature 3: Brief description
- Feature 4: Brief description

**Design Elements:** [Describe the visual design and user experience]
- Visual style and color scheme
- Layout and navigation approach
- Interactive elements and animations
- Mobile responsiveness considerations

**Implementation Plan:** [Technical implementation details]
- Main components to create
- File structure organization
- Key functionality to implement
- Any special considerations

Provide a thoughtful, comprehensive analysis that will guide the implementation phase.`

  const thinkingUserPrompt = isEdit
    ? `The user wants to modify an existing application with this request: "${prompt}"\n\nAnalyze what changes are needed and provide a focused implementation plan for the modifications.`
    : `The user wants to create a new application with this request: "${prompt}"\n\nAnalyze the requirements and provide a comprehensive implementation plan for building this from scratch.`

  try {
    const modelProvider = await getAIProvider(model)
    const isAnthropic = model.startsWith('anthropic/')
    const isGoogle = model.startsWith('google/')
    const isOpenAI = model.startsWith('openai/')

    let actualModel: string
    if (isAnthropic) {
      actualModel = model.replace('anthropic/', '')
    } else if (isOpenAI) {
      actualModel = model.replace('openai/', '')
    } else if (isGoogle) {
      actualModel = model.replace('google/', '')
    } else {
      actualModel = model
    }

    const thinkingOptions = {
      model: modelProvider(actualModel) as Parameters<typeof streamText>[0]['model'],
      messages: [
        { role: 'system' as const, content: thinkingSystemPrompt },
        { role: 'user' as const, content: thinkingUserPrompt },
      ],
      maxTokens: 2048,
      temperature: 0.7,
    }

    let analysis = ''
    const result = streamText(thinkingOptions)
    for await (const textPart of result?.textStream || []) {
      analysis += textPart || ''
    }

    const enhancedPrompt = `${analysis}\n\n---\n\nBased on the analysis above, implement the following user request:\n\n${prompt}`

    console.log(`[performThinkingPhase] Analysis completed. Length: ${analysis.length} chars`)
    return { analysis, enhancedPrompt }
  } catch (error) {
    console.warn(`[performThinkingPhase] Thinking phase failed:`, error)
    return {
      analysis: 'Thinking phase unavailable - proceeding with direct implementation.',
      enhancedPrompt: prompt,
    }
  }
}

/**
 * Extract component imports from App.tsx
 * Returns array of component names and their file paths
 */
function extractComponentImports(appContent: string): Array<{ name: string; path: string }> {
  const components: Array<{ name: string; path: string }> = []

  const importRegex = /import\s+(?:{[^}]+}|(\w+))\s+from\s+['"](\.[^'"]+)['"];?/gm
  let match
  while ((match = importRegex.exec(appContent)) !== null) {
    const componentName = match[1]
    const importPath = match[2]

    if (componentName && importPath.startsWith('./')) {
      let filePath = importPath
      if (filePath.startsWith('./')) {
        filePath = filePath.substring(2)
      }

      if (!filePath.includes('.')) {
        filePath += '.tsx'
      }
      if (!filePath.startsWith('src/')) {
        filePath = `src/${filePath}`
      }

      const existing = components.find((c) => c.name === componentName)
      if (!existing) {
        components.push({ name: componentName, path: filePath })
      }
    }
  }

  return components
}

/**
 * Generate individual React component
 * Creates complete functional component with proper imports and styling
 */
async function generateComponent(
  componentName: string,
  componentPath: string,
  appContent: string,
  existingComponents: Map<string, string>,
  prompt: string,
  model: string,
  provider: SandboxProvider,
  onProgress: (event: ProgressEvent) => Promise<void> | void
): Promise<{ success: boolean; content?: string; error?: string; filePath?: string }> {
  try {
    const modelProvider = await getAIProvider(model)
    const actualModel = model.includes('/') ? model.split('/')[1] : model

    let componentContext = `You are generating a React component named "${componentName}".

`
    componentContext += `User's Original Request: ${prompt}\n\n`
    componentContext += `App.tsx content:\n\`\`\`tsx\n${appContent}\n\`\`\`\n\n`

    if (existingComponents.size > 0) {
      componentContext += `Already generated components:\n`
      for (const [name, content] of existingComponents) {
        componentContext += `\n${name}.tsx:\n\`\`\`tsx\n${content.substring(0, 500)}...\n\`\`\`\n`
      }
    }

    const componentPrompt = `Generate ONLY the ${componentName} component.

IMPORTANT:
1. Create a COMPLETE, FULLY FUNCTIONAL component - NO PLACEHOLDERS
2. The component should match how it's used in App.tsx
3. Include all necessary imports (React, lucide-react icons, etc.)
4. Use Tailwind CSS for styling
5. Make it beautiful and production-ready
6. Export as default
7. **AIM TO KEEP COMPONENTS UNDER 200 LINES** when possible - extract helper functions for complex logic
8. Focus on clean, readable code with good separation of concerns
9. Prioritize functionality over strict line limits - complete features are more important

Return ONLY the component code, no explanations or markdown.`

    await onProgress({
      type: 'step',
      step: 3,
      message: `Generating ${componentName} component...`,
      packages: [],
    })

    const streamOptions = {
      model: modelProvider(actualModel),
      messages: [
        { role: 'system' as const, content: componentContext },
        { role: 'user' as const, content: componentPrompt },
      ],
      maxTokens: 4096,
      temperature: 0.7,
    }

    let componentCode = ''
    const result = streamText(streamOptions as Parameters<typeof streamText>[0])

    for await (const textPart of result?.textStream || []) {
      componentCode += textPart || ''
    }

    componentCode = componentCode.replace(/^```(?:tsx?|jsx?)?\n?/, '').replace(/\n?```$/, '')

    const lineCount = componentCode.split('\n').length
    if (lineCount > 200) {
      console.log(
        `[generateComponent] Component ${componentName} is ${lineCount} lines (over 200 line guideline)`
      )

      if (lineCount > 250) {
        console.warn(
          `[generateComponent] Component ${componentName} is quite large (${lineCount} lines), attempting optimization...`
        )
        const optimizationPrompt =
          componentPrompt +
          `\n\nNOTE: The component is ${lineCount} lines. If possible, consider extracting some logic into helper functions to improve readability, but maintain full functionality.`

        const retryOptions = {
          model: modelProvider(actualModel),
          messages: [
            { role: 'system' as const, content: componentContext },
            { role: 'user' as const, content: optimizationPrompt },
          ],
          maxTokens: 4096,
          temperature: 0.7,
        }

        let optimizedCode = ''
        const retryResult = streamText(retryOptions as Parameters<typeof streamText>[0])

        for await (const textPart of retryResult?.textStream || []) {
          optimizedCode += textPart || ''
        }

        optimizedCode = optimizedCode.replace(/^```(?:tsx?|jsx?)?\n?/, '').replace(/\n?```$/, '')

        const newLineCount = optimizedCode.split('\n').length
        if (newLineCount < lineCount && newLineCount > 50) {
          console.log(
            `[generateComponent] Optimized ${componentName} from ${lineCount} to ${newLineCount} lines`
          )
          componentCode = optimizedCode
        } else {
          console.log(
            `[generateComponent] Keeping original ${componentName} (${lineCount} lines) - optimization didn't improve it`
          )
        }
      }
    } else {
      console.log(
        `[generateComponent] Component ${componentName} is ${lineCount} lines (within guideline)`
      )
    }

    return { success: true, content: componentCode, filePath: componentPath }
  } catch (error) {
    console.error(`[generateComponent] Error generating ${componentName}:`, error)
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Save chat message to database
 * Stores user and assistant messages for conversation history
 */
async function saveChatMessage(
  projectId: string,
  userId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
) {
  try {
    const { createClient } = await import('@/lib/clients/supabase/server')
    const supabase = await createClient()

    const { error } = await supabase.from('chat_messages').insert({
      project_id: projectId,
      user_id: userId,
      role,
      content,
    })

    if (error) {
      console.error('[saveChatMessage] Error saving message:', error)
    }
  } catch (error) {
    console.error('[saveChatMessage] Failed to save message:', error)
  }
}

/**
 * Check for duplicate prompts in recent history
 * Prevents accidental regeneration of same request
 */
async function checkDuplicatePrompt(
  projectId: string,
  userId: string,
  prompt: string,
  timeWindowMinutes: number = 5
): Promise<boolean> {
  try {
    const { createClient } = await import('@/lib/clients/supabase/server')
    const supabase = await createClient()

    const timeThreshold = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('chat_messages')
      .select('content')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('role', 'user')
      .gte('created_at', timeThreshold)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('[checkDuplicatePrompt] Error checking duplicates:', error)
      return false
    }

    return (
      data?.some((msg: { content: string | null }) => msg.content?.trim() === prompt.trim()) ||
      false
    )
  } catch (error) {
    console.error('[checkDuplicatePrompt] Failed to check duplicates:', error)
    return false
  }
}

/**
 * Main AI code generation function
 * Processes user prompts and generates complete applications
 */
export async function applyAiCodeStream(
  input: ApplyAiCodeStreamInput,
  onProgress: (event: ProgressEvent) => Promise<void> | void
): Promise<ApplyAiCodeStreamResult> {
  const {
    prompt,
    model = 'anthropic/claude-sonnet-4-20250514',
    context,
    isEdit = false,
    packages = [],
    sandboxId,
  } = input

  console.log(
    `[applyAiCodeStream] Starting with model: ${model}, isEdit: ${isEdit}, sandboxId: ${sandboxId}`
  )
  console.log(`[applyAiCodeStream] Prompt: ${prompt.substring(0, 100)}...`)

  const projectId = context?.conversationContext?.currentProject
  const userId = (context as { userId?: string })?.userId
  if (projectId && userId && !isEdit) {
    const isDuplicate = await checkDuplicatePrompt(projectId, userId, prompt)
    if (isDuplicate) {
      console.log(`[applyAiCodeStream] Duplicate prompt detected, skipping generation`)
      await onProgress({
        type: 'warning',
        message: 'This prompt was recently processed. Skipping to prevent duplicate generation.',
      })

      return {
        success: false,
        results: {
          filesCreated: [],
          filesUpdated: [],
          packagesInstalled: [],
          packagesAlreadyInstalled: [],
          packagesFailed: [],
          commandsExecuted: [],
          errors: ['Duplicate prompt detected - generation skipped to prevent regeneration'],
        },
        explanation: 'Duplicate prompt detected',
        structure: null,
        parsedFiles: [],
        message: 'Generation skipped - duplicate prompt detected',
      }
    }
  }

  if (projectId && userId) {
    await saveChatMessage(projectId, userId, 'user', prompt)
  }

  const isVisualEdit =
    context?.visualEditorContext?.isVisualEdit && context.visualEditorContext.selectedElement

  let finalPrompt = prompt
  let thinkingAnalysis = ''

  if (!isEdit && !isVisualEdit) {
    await onProgress({ type: 'start', message: 'Analyzing requirements...', totalSteps: 6 })
    try {
      const thinkingResult = await performThinkingPhase(prompt, model, isEdit, context)
      thinkingAnalysis = thinkingResult.analysis
      finalPrompt = thinkingResult.enhancedPrompt
      await onProgress({
        type: 'step',
        step: 1,
        message: 'Analysis complete, planning implementation...',
        packages: [],
      })
    } catch (error) {
      console.warn(`[applyAiCodeStream] Thinking phase error:`, error)
      await onProgress({
        type: 'warning',
        message: 'Analysis phase skipped, proceeding with implementation...',
      })
    }
  } else if (isVisualEdit) {
    await onProgress({ type: 'start', message: 'Preparing visual edit...', totalSteps: 3 })
  } else {
    await onProgress({ type: 'start', message: 'Initializing AI...', totalSteps: 6 })
  }

  if (!globalThis.existingFiles) {
    globalThis.existingFiles = new Set<string>() as unknown as Set<string>
  }

  if (!global.conversationState) {
    global.conversationState = {
      conversationId: `conv-${Date.now()}`,
      startedAt: Date.now(),
      lastUpdated: Date.now(),
      context: {
        messages: [],
        edits: [],
        projectEvolution: { majorChanges: [] },
        userPreferences: {},
      },
    }
  }

  const userMessage: ConversationMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: prompt,
    timestamp: Date.now(),
    metadata: {
      sandboxId: context?.sandboxId,
    },
  }
  global.conversationState.context.messages.push(userMessage)

  if (global.conversationState.context.messages.length > 20) {
    global.conversationState.context.messages = global.conversationState.context.messages.slice(-15)
  }

  if (global.conversationState.context.edits.length > 10) {
    global.conversationState.context.edits = global.conversationState.context.edits.slice(-8)
  }

  console.log(`[applyAiCodeStream] Ensuring provider for sandbox: ${sandboxId}`)
  const provider = await ensureProviderForSandbox(sandboxId)
  console.log(`[applyAiCodeStream] Provider ensured successfully`)

  const results: ApplyAiCodeStreamResult['results'] = {
    filesCreated: [],
    filesUpdated: [],
    packagesInstalled: [],
    packagesAlreadyInstalled: [],
    packagesFailed: [],
    commandsExecuted: [],
    errors: [],
  }

  try {
    const rawFiles = await provider.listFiles('/home/user/app')
    if (!globalThis.existingFiles) {
      globalThis.existingFiles = new Set<string>() as unknown as Set<string>
    }
    const configFiles = new Set([
      'tailwind.config.js',
      'vite.config.js',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'postcss.config.js',
    ])
    for (const path of rawFiles) {
      let normalizedPath = path
      if (normalizedPath.startsWith('/')) normalizedPath = normalizedPath.substring(1)
      if (
        !normalizedPath.startsWith('src/') &&
        !normalizedPath.startsWith('public/') &&
        normalizedPath !== 'index.html' &&
        !configFiles.has((normalizedPath.split('/').pop() || '').trim())
      ) {
        normalizedPath = `src/${normalizedPath}`
      }
      ;(globalThis.existingFiles as unknown as Set<string>).add(normalizedPath)
    }
  } catch (seedError) {
    console.warn('[applyAiCodeStream] Failed to seed existing files from provider:', seedError)
  }

  let editContext = null
  let enhancedSystemPrompt = ''

  if (isEdit) {
    await onProgress({
      type: 'step',
      step: 1,
      message: '🔍 Analyzing edit context...',
      packages: [],
    })

    const manifest = global.sandboxState?.fileCache?.manifest as FileManifest | undefined

    if (manifest) {
      await onProgress({
        type: 'step',
        step: 2,
        message: '🔍 Creating search plan...',
        packages: [],
      })

      try {
        // Use context selector for intelligent file selection
        editContext = selectFilesForEdit(prompt, manifest)
        enhancedSystemPrompt = editContext.systemPrompt

        // Enhance with intent analysis for better classification
        const intentAnalysis = analyzeEditIntent(prompt, manifest)
        if (intentAnalysis && editContext.editIntent) {
          editContext.editIntent.confidence = Math.max(
            editContext.editIntent.confidence,
            intentAnalysis.confidence
          )
          if (intentAnalysis.description) {
            editContext.editIntent.description = intentAnalysis.description
          }
        }

        await onProgress({
          type: 'step',
          step: 3,
          message: `Identified edit type: ${editContext.editIntent?.description || 'Code modification'}`,
          packages: [],
        })

        // Execute file search for line-level precision
        await onProgress({
          type: 'step',
          step: 4,
          message: '🔍 Searching for exact code locations...',
          packages: [],
        })

        try {
          // Create search plan from edit intent
          const searchPlan = createSearchPlan(editContext.editIntent, prompt)

          // Get file contents for search
          const searchFiles: Record<string, string> = {}
          for (const filePath of editContext.primaryFiles) {
            try {
              const content = await provider.readFile(filePath.replace('/home/user/app/', ''))
              searchFiles[filePath] = content
            } catch (fileError) {
              console.warn(`[file-search] Could not read file ${filePath}:`, fileError)
            }
          }

          // Execute search if we have files to search
          if (Object.keys(searchFiles).length > 0) {
            const searchResults = executeSearchPlan(searchPlan, searchFiles)

            if (searchResults.success && searchResults.results.length > 0) {
              // Format search results for AI
              const searchContext = formatSearchResultsForAI(searchResults.results)

              // Get the best target file and line
              const targetLocation = selectTargetFile(
                searchResults.results,
                editContext.editIntent.type
              )

              // Enhance system prompt with precise search results
              enhancedSystemPrompt += `\n\n## PRECISE CODE LOCATIONS FOUND\n\n${searchContext}`

              if (targetLocation) {
                enhancedSystemPrompt += `\n\n## RECOMMENDED EDIT LOCATION\n\nFile: ${targetLocation.filePath}\nLine: ${targetLocation.lineNumber}\nReason: ${targetLocation.reason}\n\n**CRITICAL**: Focus your edits around line ${targetLocation.lineNumber} in ${targetLocation.filePath}`
              }

              await onProgress({
                type: 'step',
                step: 5,
                message: `Found ${searchResults.results.length} precise code locations to edit`,
                packages: [],
              })
            } else {
              await onProgress({
                type: 'warning',
                message: 'No specific code locations found, proceeding with file-level editing',
              })
            }
          }
        } catch (searchError) {
          console.warn('[file-search] Search execution failed:', searchError)
          await onProgress({
            type: 'warning',
            message: 'Code search failed, proceeding with file-level editing',
          })
        }
      } catch (error) {
        await onProgress({
          type: 'warning',
          message: `Error using context selector: ${String(error)}. Proceeding with general edit mode.`,
        })
      }
    } else {
      await onProgress({
        type: 'warning',
        message:
          'No file manifest available for targeted edits. Proceeding with general edit mode.',
      })
    }
  }

  let conversationContext = ''
  if (global.conversationState && global.conversationState.context.messages.length > 1) {
    conversationContext = `\n\n## Conversation History (Recent)\n`

    const recentEdits = global.conversationState.context.edits.slice(-3)
    if (recentEdits.length > 0) {
      conversationContext += `\n### Recent Edits:\n`
      recentEdits.forEach((edit: ConversationEdit) => {
        conversationContext += `- "${edit.userRequest}" → ${edit.editType} (${edit.targetFiles.map((f: string) => f.split('/').pop()).join(', ')})\n`
      })
    }

    const recentMsgs = global.conversationState.context.messages.slice(-5)
    const recentlyCreatedFiles: string[] = []
    recentMsgs.forEach((msg: ConversationMessage) => {
      if (msg.metadata?.editedFiles) {
        recentlyCreatedFiles.push(...msg.metadata.editedFiles)
      }
    })

    if (recentlyCreatedFiles.length > 0) {
      const uniqueFiles = [...new Set(recentlyCreatedFiles)]
      conversationContext += `\n### 🚨 RECENTLY CREATED/EDITED FILES (DO NOT RECREATE THESE):\n`
      uniqueFiles.forEach((file) => {
        conversationContext += `- ${file}\n`
      })
      conversationContext += `\nIf the user mentions any of these components, UPDATE the existing file!\n`
    }

    const recentMessages = recentMsgs
    if (recentMessages.length > 2) {
      conversationContext += `\n### Recent Messages:\n`
      recentMessages.slice(0, -1).forEach((msg: ConversationMessage) => {
        if (msg.role === 'user') {
          const truncatedContent =
            msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content
          conversationContext += `- "${truncatedContent}"\n`
        }
      })
    }

    const majorChanges = global.conversationState.context.projectEvolution.majorChanges.slice(-2)
    if (majorChanges.length > 0) {
      conversationContext += `\n### Recent Changes:\n`
      majorChanges.forEach(
        (change: { timestamp: number; description: string; filesAffected: string[] }) => {
          conversationContext += `- ${change.description}\n`
        }
      )
    }

    // Analyze user preferences inline
    const userMessages = global.conversationState.context.messages.filter((m) => m.role === 'user')
    let targetedEditCount = 0
    let comprehensiveEditCount = 0
    const patterns: string[] = []

    userMessages.forEach((msg) => {
      const content = msg.content.toLowerCase()
      if (content.match(/\b(update|change|fix|modify|edit|remove|delete)\s+(\w+\s+)?(\w+)\b/)) {
        targetedEditCount++
      }
      if (content.match(/\b(rebuild|recreate|redesign|overhaul|refactor)\b/)) {
        comprehensiveEditCount++
      }
      if (content.includes('hero')) patterns.push('hero section edits')
      if (content.includes('header')) patterns.push('header modifications')
      if (content.includes('color') || content.includes('style')) patterns.push('styling changes')
    })

    const commonPatterns = [...new Set(patterns)].slice(0, 3)
    const preferredEditStyle =
      targetedEditCount > comprehensiveEditCount ? 'targeted' : 'comprehensive'

    if (commonPatterns.length > 0) {
      conversationContext += `\n### User Preferences:\n`
      conversationContext += `- Edit style: ${preferredEditStyle}\n`
    }

    if (conversationContext.length > 2000) {
      conversationContext =
        conversationContext.substring(0, 2000) + '\n[Context truncated to prevent length errors]'
    }
  }

  let visualEditorPrompt = ''
  if (context?.visualEditorContext?.isVisualEdit && context.visualEditorContext.selectedElement) {
    const el = context.visualEditorContext.selectedElement
    visualEditorPrompt = `
🎯 VISUAL EDITOR MODE - TARGETED ELEMENT EDITING

You are in VISUAL EDITOR MODE. The user has specifically selected an element to edit:

**SELECTED ELEMENT:**
- Element Type: ${el.elementType}
- CSS Selector: ${el.selector}
- Text Content: "${el.textContent.slice(0, 200)}${el.textContent.length > 200 ? '...' : ''}"
- Position: x=${el.bounds.x}, y=${el.bounds.y}, width=${el.bounds.width}, height=${el.bounds.height}

**VISUAL EDITING RULES:**
1. **FOCUS ONLY ON THE SELECTED ELEMENT** - Do not modify unrelated parts of the application
2. **MAINTAIN ELEMENT STRUCTURE** - Keep the same element type (${el.elementType}) unless explicitly asked to change it
3. **PRESERVE LAYOUT** - Maintain the element's position and general styling unless specifically requested to change it
4. **UPDATE CONTENT PRECISELY** - Focus on the specific content or styling the user wants to change
5. **KEEP CONTEXT** - Ensure changes work well with surrounding elements

The user's request should be applied specifically to this selected element.
`
  }

  const systemPrompt = `You are an expert React developer with perfect memory of the conversation. You maintain context across messages and remember scraped websites, generated components, and applied code. Generate clean, modern React code for Vite applications.
${conversationContext}
${visualEditorPrompt}

${isEdit ? getEditExamplesPrompt() : ''}

🚨 CRITICAL RULES - YOUR MOST IMPORTANT INSTRUCTIONS:
1. **DO EXACTLY WHAT IS ASKED - NOTHING MORE, NOTHING LESS**
2. **DESIGN MUST NOT BE COOKIECUTTER** – produce distinctive, modern UIs.
   - Use Tailwind utilities with gradients (e.g., bg-gradient-to-br, from-indigo-500 via-purple-500 to-pink-500), rounded-xl/2xl, shadow-lg/2xl, good spacing, and responsive layouts
3. **USE MICRO-ANIMATIONS AND SMOOTH INTERACTIONS** where appropriate
   - Use transition, duration-*, ease-*, group-hover, and motion-safe animate-[pulse/spin/bounce] subtly and purposefully (avoid flashy, distracting motion)
4. **ICONS AND LOGOS MUST USE lucide-react EXCLUSIVELY**
   - Import only from 'lucide-react'. Do not inline custom SVGs. Do not use other icon packs
   - **CRITICAL**: Only use VALID lucide-react icon names. Invalid icons will cause runtime errors
   - Use common valid icons like Activity, Heart, Star, User, Home, Settings, etc.
5. **ACCESSIBILITY AND SEMANTICS**
   - Use semantic HTML, proper roles/aria-*, visible focus states, keyboard navigation, and sufficient color contrast
6. **CREATE COMPLETE, FUNCTIONAL APPLICATIONS**
7. **COMPONENT SIZE GUIDELINES**
   - Aim to keep components under 200 lines when feasible for maintainability
   - Extract complex logic into helper functions or custom hooks when it makes sense
   - Consider splitting very large components into smaller sub-components
   - Each component should have a clear, focused responsibility
   - Prioritize complete functionality over strict line limits
8. **SECURITY HYGIENE**
   - Do not use dangerouslySetInnerHTML with untrusted content; validate/escape user input when rendering

${
  isEdit
    ? `CRITICAL: THIS IS AN EDIT TO AN EXISTING APPLICATION

YOU MUST FOLLOW THESE EDIT RULES:
0. NEVER create tailwind.config.js, vite.config.js, package.json, or any other config files - they already exist!
1. DO NOT regenerate the entire application
2. DO NOT create files that already exist
3. ONLY edit the EXACT files needed for the requested change - NO MORE, NO LESS
4. IMPORTANT: When adding new components or libraries:
   - Create the new component file (aim for under 200 lines when practical)
   - UPDATE ONLY the parent component that will use it
5. Aim to keep components under 200 lines when feasible

${
  editContext
    ? `
TARGETED EDIT MODE ACTIVE
- Edit Type: ${editContext.editIntent.type}
- Confidence: ${editContext.editIntent.confidence}
- Files to Edit: ${editContext.primaryFiles.join(', ')}

🚨 CRITICAL RULE - VIOLATION WILL RESULT IN FAILURE 🚨
YOU MUST ***ONLY*** GENERATE THE FILES LISTED ABOVE!
`
    : ''
}
`
    : `CRITICAL: THIS IS A NEW PROJECT GENERATION

YOU MUST FOLLOW THESE NEW PROJECT RULES:
1. **CREATE A COMPLETE, FUNCTIONAL APPLICATION** that matches the user's request
2. **ALWAYS INCLUDE src/App.tsx** as the main component that renders everything
3. **INCLUDE src/index.css** with Tailwind setup
4. **CREATE ALL NECESSARY COMPONENTS** to make the app work
5. **USE MODERN REACT PATTERNS**: functional components, hooks, proper state management
6. **MAKE IT RESPONSIVE AND VISUALLY APPEALING** with Tailwind CSS
7. **INCLUDE REALISTIC CONTENT** - don't use placeholder text, make it look real
8. **FOLLOW THE DESIGN RULES ABOVE** – gradients, micro-animations, and lucide-react for all icons/logos
9. **KEEP COMPONENTS FOCUSED** - Aim for under 200 lines when practical

CRITICAL CODE GENERATION REQUIREMENTS:
1. **NO PLACEHOLDERS**: Every file must contain complete, working code
2. **App.tsx FIRST**: Always generate App.tsx before any components it imports
3. **COMPONENT ORDER**: After App.tsx, generate each component in the order they're imported
4. **NO STUB CODE**: Never use comments like "// TODO", "// Add implementation", "// Component here"
5. **COMPLETE IMPLEMENTATIONS**: Every function, component, and feature must be fully implemented
6. **SIZE GUIDELINES**: Aim for components under 200 lines when practical
   - Consider breaking very large components into smaller sub-components
   - Use composition over large monolithic components when it improves clarity
   - Extract reusable logic into custom hooks when beneficial

EXAMPLE STRUCTURE FOR NEW PROJECTS:
- src/App.tsx (main app component with ALL imports defined)
- src/index.css (Tailwind styles)
- src/components/ (each component with FULL implementation)
`
}

Use this XML format for React components:

<file path="src/index.css">
@tailwind base;
@tailwind components;
@tailwind utilities;
</file>

<file path="src/App.tsx">
import React from 'react'
import { Menu, Search, User } from 'lucide-react'
import Header from './components/Header'
import MainContent from './components/MainContent'
import Footer from './components/Footer'

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />
      <MainContent />
      <Footer />
    </div>
  )
}

export default App
</file>

<file path="src/components/Header.tsx">
import React from 'react'
import { Menu } from 'lucide-react'

const Header = () => {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            My Application
          </h1>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200">
            <Menu className="h-6 w-6 text-gray-600" />
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
</file>

<file path="src/components/MainContent.tsx">
// FULL implementation required - no placeholders
</file>`

  let fullPrompt = finalPrompt
  if (context) {
    const contextParts = []

    if (context.sandboxId) {
      contextParts.push(`Current sandbox ID: ${context.sandboxId}`)
    }

    if (context.structure) {
      contextParts.push(`Current file structure:\n${context.structure}`)
    }

    const backendFiles = global.sandboxState?.fileCache?.files || {}
    const hasBackendFiles = Object.keys(backendFiles).length > 0

    if (hasBackendFiles) {
      if (editContext && editContext.primaryFiles.length > 0) {
        contextParts.push('\nEXISTING APPLICATION - TARGETED EDIT MODE')
        contextParts.push(`\n${editContext.systemPrompt || enhancedSystemPrompt}\n`)

        try {
          const manifest = global.sandboxState?.fileCache?.manifest
          if (manifest) {
            const primaryFileContents = await getFileContents(
              editContext.primaryFiles,
              manifest as Parameters<typeof getFileContents>[1]
            )
            const contextFileContents = await getFileContents(
              editContext.contextFiles,
              manifest as Parameters<typeof getFileContents>[1]
            )

            const formattedFiles = formatFilesForAI(primaryFileContents, contextFileContents)
            contextParts.push(formattedFiles)
          }

          contextParts.push(
            '\nIMPORTANT: Only modify the files listed under "Files to Edit". The context files are provided for reference only.'
          )
        } catch {
          contextParts.push(
            '\nNote: Could not retrieve file contents for targeted editing. Using general edit mode.'
          )
        }
      } else {
        contextParts.push('\nEXISTING APPLICATION - TARGETED EDIT REQUIRED')
        contextParts.push('\nCurrent project files (DO NOT regenerate all of these):')

        const fileEntries = Object.entries(backendFiles)

        contextParts.push('\n### File List:')
        for (const [path] of fileEntries) {
          contextParts.push(`- ${path}`)
        }

        contextParts.push('\n### File Contents (ALL FILES FOR CONTEXT):')
        for (const [path, fileData] of fileEntries) {
          const content = (fileData as { content?: string })?.content
          if (typeof content === 'string') {
            contextParts.push(`\n<file path="${path}">\n${content}\n</file>`)
          }
        }
      }
    } else if (context.currentFiles && Object.keys(context.currentFiles).length > 0) {
      contextParts.push('\nEXISTING APPLICATION - DO NOT REGENERATE FROM SCRATCH')
      contextParts.push('Current project files (modify these, do not recreate):')

      const fileEntries = Object.entries(context.currentFiles)
      for (const [path, content] of fileEntries) {
        if (typeof content === 'string') {
          contextParts.push(`\n<file path="${path}">\n${content}\n</file>`)
        }
      }
    }

    if (context.conversationContext) {
      if (
        context.conversationContext.scrapedWebsites &&
        context.conversationContext.scrapedWebsites.length > 0
      ) {
        contextParts.push('\nScraped Websites in Context:')
        context.conversationContext.scrapedWebsites.forEach(
          (site: { url: string; timestamp: string | number | Date; content?: unknown }) => {
            contextParts.push(`\nURL: ${site.url}`)
            contextParts.push(`Scraped: ${new Date(site.timestamp).toLocaleString()}`)
            if (site.content) {
              const contentPreview =
                typeof site.content === 'string'
                  ? site.content.substring(0, 1000)
                  : JSON.stringify(site.content).substring(0, 1000)
              contextParts.push(`Content Preview: ${contentPreview}...`)
            }
          }
        )
      }

      if (context.conversationContext.currentProject) {
        contextParts.push(`\nCurrent Project: ${context.conversationContext.currentProject}`)
      }
    }

    if (contextParts.length > 0) {
      fullPrompt = `CONTEXT:\n${contextParts.join('\n')}\n\nUSER REQUEST:\n${finalPrompt}`
    }
  }

  // Initialize AI model provider (needed for both edit and generation flows)
  const modelProvider = await getAIProvider(model)
  const isAnthropic = model.startsWith('anthropic/')
  const isGoogle = model.startsWith('google/')
  const isOpenAI = model.startsWith('openai/')
  let actualModel: string
  if (isAnthropic) {
    actualModel = model.replace('anthropic/', '')
  } else if (isOpenAI) {
    actualModel = model.replace('openai/', '')
  } else if (isGoogle) {
    actualModel = model.replace('google/', '')
  } else {
    actualModel = model
  }

  // Handle edit operations separately from new project generation
  if (isEdit && !isVisualEdit) {
    // Edit flow - use the context selector and file search results
    if (editContext && editContext.primaryFiles.length > 0) {
      await onProgress({
        type: 'step',
        step: 6,
        message: 'Applying targeted edits...',
        packages: [],
      })

      // Use the enhanced system prompt with edit context
      const editPrompt = enhancedSystemPrompt || systemPrompt

      try {
        const result = streamText({
          model: modelProvider(actualModel) as Parameters<typeof streamText>[0]['model'],
          messages: [
            { role: 'system' as const, content: editPrompt },
            { role: 'user' as const, content: fullPrompt },
          ],
          temperature: 0.7,
        })

        let generatedCode = ''
        for await (const textPart of result?.textStream || []) {
          generatedCode += textPart || ''
        }

        // Parse and apply the edits
        const parsed = parseAIResponse(generatedCode)

        for (const file of parsed.files) {
          let normalizedPath = file.path
          if (normalizedPath.startsWith('/')) normalizedPath = normalizedPath.substring(1)
          if (
            !normalizedPath.startsWith('src/') &&
            !normalizedPath.startsWith('public/') &&
            normalizedPath !== 'index.html'
          ) {
            normalizedPath = `src/${normalizedPath}`
          }

          try {
            const dirPath = normalizedPath.includes('/')
              ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/'))
              : ''
            if (dirPath) await provider.runCommand(`mkdir -p ${dirPath}`)

            await provider.writeFile(normalizedPath, file.content)
            results.filesUpdated.push(normalizedPath)

            await onProgress({ type: 'file-complete', fileName: normalizedPath, action: 'updated' })
          } catch (error) {
            results.errors.push(`Failed to update ${normalizedPath}: ${(error as Error).message}`)
          }
        }

        // Record the edit in conversation state
        if (global.conversationState) {
          const editRecord: ConversationEdit = {
            timestamp: Date.now(),
            userRequest: prompt,
            editType: editContext.editIntent.type,
            targetFiles: editContext.primaryFiles,
            confidence: editContext.editIntent.confidence,
            outcome: 'success',
          }
          global.conversationState.context.edits.push(editRecord)
          global.conversationState.lastUpdated = Date.now()
        }

        await onProgress({
          type: 'complete',
          results,
          explanation: parsed.explanation || 'Edit completed successfully',
          structure: parsed.structure,
          message: `Successfully updated ${results.filesUpdated.length} files`,
        })

        if (projectId && userId) {
          const assistantMessage = `Updated ${results.filesUpdated.length} files: ${results.filesUpdated.join(', ')}`
          await saveChatMessage(projectId, userId, 'assistant', assistantMessage)
        }

        return {
          success: true,
          results,
          explanation: parsed.explanation || 'Edit completed successfully',
          structure: parsed.structure,
          parsedFiles: parsed.files,
          message: `Updated ${results.filesUpdated.length} files`,
          thinkingAnalysis: undefined,
        }
      } catch (error) {
        console.error('[applyAiCodeStream] Edit execution failed:', error)
        results.errors.push(`Edit execution failed: ${(error as Error).message}`)

        return {
          success: false,
          results,
          explanation: 'Edit execution failed',
          structure: null,
          parsedFiles: [],
          message: 'Edit execution failed',
          thinkingAnalysis: undefined,
        }
      }
    } else {
      // No edit context available, fall back to general edit mode
      await onProgress({
        type: 'warning',
        message: 'No specific edit context available, proceeding with general modification mode...',
      })
    }
  }

  // New project generation flow
  const currentStep = isEdit ? 6 : 2
  await onProgress({
    type: 'step',
    step: currentStep,
    message: 'Planning application structure...',
    packages: [],
  })

  const packagesToInstall: string[] = []

  await onProgress({
    type: 'step',
    step: currentStep + 1,
    message: 'Generating code...',
    packages: [],
  })

  if (isVisualEdit) {
    await onProgress({
      type: 'step',
      step: 1,
      message: 'Identifying target component...',
      packages: [],
    })

    const selectedElement = context.visualEditorContext!.selectedElement

    let targetComponentPath: string | null = null
    let targetComponentContent: string | null = null

    if (context.currentFiles) {
      if (selectedElement.componentPath) {
        const componentFile = Object.entries(context.currentFiles).find(
          ([path]) =>
            path.includes(selectedElement.componentPath!) ||
            path.endsWith(`/${selectedElement.componentPath!}`) ||
            path === selectedElement.componentPath
        )
        if (componentFile) {
          targetComponentPath = componentFile[0]
          targetComponentContent = String(componentFile[1])
          console.log('[Visual Edit] Found component by path:', targetComponentPath)
        }
      }

      if (!targetComponentPath && selectedElement.componentName) {
        const componentFile = Object.entries(context.currentFiles).find(([path, content]) => {
          const fileName = path
            .split('/')
            .pop()
            ?.replace(/\.(tsx|jsx)$/, '')
          const contentStr = String(content)
          return (
            fileName === selectedElement.componentName ||
            contentStr.includes(`function ${selectedElement.componentName}`) ||
            contentStr.includes(`const ${selectedElement.componentName}`) ||
            contentStr.includes(`export default ${selectedElement.componentName}`)
          )
        })
        if (componentFile) {
          targetComponentPath = componentFile[0]
          targetComponentContent = String(componentFile[1])
          console.log('[Visual Edit] Found component by name:', targetComponentPath)
        }
      }

      if (!targetComponentPath) {
        const textToMatch = selectedElement.textContent.slice(0, 30).trim()
        if (textToMatch.length > 5) {
          const sortedFiles = Object.entries(context.currentFiles).sort(([pathA], [pathB]) => {
            const isAppA =
              pathA.toLowerCase().includes('app.tsx') || pathA.toLowerCase().includes('app.jsx')
            const isAppB =
              pathB.toLowerCase().includes('app.tsx') || pathB.toLowerCase().includes('app.jsx')
            if (isAppA && !isAppB) return 1 // App files go last
            if (!isAppA && isAppB) return -1 // Non-App files go first
            return 0
          })

          for (const [filePath, fileContent] of sortedFiles) {
            const fileContentStr = String(fileContent)
            if (
              (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) &&
              fileContentStr.includes(textToMatch)
            ) {
              targetComponentPath = filePath
              targetComponentContent = fileContentStr
              console.log('[Visual Edit] Found component by text content:', targetComponentPath)
              break
            }
          }
        }
      }
    }

    if (!targetComponentPath || !targetComponentContent) {
      console.error('[Visual Edit] Failed to identify target component:', {
        hasComponentPath: !!selectedElement.componentPath,
        hasComponentName: !!selectedElement.componentName,
        textContent: selectedElement.textContent.slice(0, 50),
        availableFiles: Object.keys(context.currentFiles || {}),
      })
      throw new Error(
        `Could not identify target component for visual edit. Element: "${selectedElement.textContent.slice(0, 50)}..." in ${selectedElement.elementType}`
      )
    }

    if (
      targetComponentPath.toLowerCase().includes('app.tsx') ||
      targetComponentPath.toLowerCase().includes('app.jsx')
    ) {
      const nonAppFiles = Object.keys(context.currentFiles || {}).filter(
        (path) =>
          (path.endsWith('.tsx') || path.endsWith('.jsx')) &&
          !path.toLowerCase().includes('app.tsx') &&
          !path.toLowerCase().includes('app.jsx')
      )
      if (nonAppFiles.length > 0) {
        console.warn(
          '[Visual Edit] Warning: Editing App.tsx when other components are available. This might not be the intended target.'
        )
      }
    }

    await onProgress({
      type: 'step',
      step: 2,
      message: `Editing ${targetComponentPath}...`,
      packages: [],
    })

    const visualEditPrompt = `${visualEditorPrompt}

CURRENT COMPONENT CODE:
\`\`\`tsx
${targetComponentContent}
\`\`\`

USER REQUEST: ${prompt}

CRITICAL INSTRUCTIONS FOR PRECISE EDITING:
1. **IDENTIFY THE EXACT ELEMENT**: Find the ${selectedElement.elementType} element with selector "${selectedElement.selector}" that contains "${selectedElement.textContent.slice(0, 50)}..."
2. **MAKE MINIMAL CHANGES**: Only modify the specific attributes, content, or styling of that exact element
3. **PRESERVE EVERYTHING ELSE**: Keep all other JSX elements, imports, functions, state, and logic completely unchanged
4. **NO STRUCTURAL CHANGES**: Do not add/remove components, change the component structure, or modify unrelated code
5. **TARGETED MODIFICATION**: If changing styling, only modify the className or style of the target element
6. **CONTENT CHANGES**: If changing text content, only modify the text within the target element
7. **VALIDATE CHANGES**: Ensure the modification makes sense for the specific element type (${selectedElement.elementType})

EXAMPLE OF GOOD EDITING:
- If user says "make this button blue", only change the button's className to add blue styling
- If user says "change text to 'Hello'", only change the text content of that specific element
- If user says "make it bigger", only add size-related classes to that element

Return the COMPLETE component code with ONLY the targeted element modified. All other code must remain identical.`

    try {
      const result = streamText({
        model: modelProvider(actualModel) as Parameters<typeof streamText>[0]['model'],
        messages: [
          {
            role: 'system' as const,
            content:
              "You are an expert React developer specializing in MINIMAL, SURGICAL component edits. You make the smallest possible changes to achieve the user's request. You NEVER rewrite entire components - only modify the specific target element. Preserve all existing code structure, imports, functions, and logic.",
          },
          { role: 'user' as const, content: visualEditPrompt },
        ],
        temperature: 0.1, // Very low temperature for precise, minimal edits
      })

      let editedContent = ''
      for await (const textPart of result?.textStream || []) {
        editedContent += textPart || ''
      }

      editedContent = editedContent
        .replace(/^```[a-z]*\n?/gm, '')
        .replace(/\n?```$/gm, '')
        .trim()

      const originalLines = targetComponentContent.split('\n')
      const editedLines = editedContent.split('\n')

      let changedLines = 0
      const maxLines = Math.max(originalLines.length, editedLines.length)

      for (let i = 0; i < maxLines; i++) {
        const originalLine = originalLines[i] || ''
        const editedLine = editedLines[i] || ''
        if (originalLine.trim() !== editedLine.trim()) {
          changedLines++
        }
      }

      const changePercentage = (changedLines / maxLines) * 100

      if (changePercentage > 50) {
        console.warn(
          `[Visual Edit] Warning: ${changePercentage.toFixed(1)}% of lines changed, this might be too extensive`
        )

        const elementText = selectedElement.textContent.slice(0, 30)
        if (targetComponentContent.includes(elementText) && !editedContent.includes(elementText)) {
          throw new Error('Visual edit removed the target element content - edit rejected')
        }
      }

      if (
        !editedContent.includes('export') ||
        (!editedContent.includes('function') && !editedContent.includes('const'))
      ) {
        throw new Error('Visual edit produced invalid component structure - edit rejected')
      }

      await provider.writeFile(targetComponentPath, editedContent)
      results.filesUpdated.push(targetComponentPath)

      await onProgress({ type: 'file-complete', fileName: targetComponentPath, action: 'updated' })
      await onProgress({ type: 'step', step: 3, message: 'Visual edit completed!', packages: [] })

      if (projectId && userId) {
        const assistantMessage = `Updated ${targetComponentPath} - modified ${selectedElement.elementType} element`
        await saveChatMessage(projectId, userId, 'assistant', assistantMessage)
      }

      return {
        success: true,
        results,
        explanation: `Successfully updated the ${selectedElement.elementType} element in ${targetComponentPath}`,
        structure: null,
        parsedFiles: [{ path: targetComponentPath, content: editedContent }],
        message: `Visual edit completed - updated ${targetComponentPath}`,
        thinkingAnalysis: undefined,
      }
    } catch (error) {
      console.error('[applyAiCodeStream] Visual edit failed:', error)
      results.errors.push(
        `Visual edit failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )

      return {
        success: false,
        results,
        explanation: 'Visual edit failed',
        structure: null,
        parsedFiles: [],
        message: 'Visual edit failed',
        thinkingAnalysis: undefined,
      }
    }
  }

  await onProgress({
    type: 'step',
    step: currentStep + 1,
    message: 'Creating application structure...',
    packages: [],
  })

  const planningSystemPrompt = `You are an expert React developer. Create the main App.tsx component and structure for the application.

${systemPrompt}

IMPORTANT FOR THIS PHASE:
1. Generate ONLY App.tsx and index.css
2. Import ONLY the components you actually need and use in the TSX
3. Create the complete App.tsx structure
4. Components will be generated separately based on your imports
5. Make sure App.tsx is complete and shows the full application structure
6. Plan for MODULAR components - aim for under 200 lines when practical
7. For complex features, consider splitting across multiple components if it improves clarity

CRITICAL: Only import components that you actually use in the JSX. Do not import unused components.

Format:
<file path="src/App.tsx">
// Complete App.tsx with ONLY the component imports you actually use in JSX
</file>

<file path="src/index.css">
@tailwind base;
@tailwind components;
@tailwind utilities;
</file>

<components>
List each component that needs to be created, one per line:
- ComponentName: Brief description of what it does (aim for <200 lines)
Note: If any component would be large, split it into multiple smaller components
</components>`

  let generatedCode = ''
  let appContent = ''
  // Planned components would be tracked here if needed
  const writtenFiles = new Set<string>()

  try {
    const result = streamText({
      model: modelProvider(actualModel) as Parameters<typeof streamText>[0]['model'],
      messages: [
        { role: 'system' as const, content: planningSystemPrompt },
        { role: 'user' as const, content: fullPrompt },
      ],
      temperature: 0.7,
    })

    for await (const textPart of result?.textStream || []) {
      generatedCode += textPart || ''
    }
  } catch (aiError) {
    const errorMessage = aiError instanceof Error ? aiError.message : String(aiError)
    console.error(`[applyAiCodeStream] Planning phase error:`, errorMessage)
    await onProgress({ type: 'error', error: errorMessage })
    throw new Error(`Planning phase failed: ${errorMessage}`)
  }

  const planningParsed = parseAIResponse(generatedCode)

  for (const file of planningParsed.files) {
    if (file.path.includes('App.') || file.path.includes('index.css')) {
      let normalizedPath = file.path
      if (normalizedPath.startsWith('/')) normalizedPath = normalizedPath.substring(1)
      if (!normalizedPath.startsWith('src/')) normalizedPath = `src/${normalizedPath}`

      const isTypeScriptProject =
        globalThis.existingFiles instanceof Set &&
        Array.from(globalThis.existingFiles as unknown as Set<string>).some(
          (p) => p.endsWith('.ts') || p.endsWith('.tsx')
        )

      if (isTypeScriptProject && normalizedPath.endsWith('.jsx')) {
        normalizedPath = normalizedPath.replace(/\.jsx$/, '.tsx')
      }

      try {
        const dirPath = normalizedPath.includes('/')
          ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/'))
          : ''
        if (dirPath) await provider.runCommand(`mkdir -p ${dirPath}`)

        await provider.writeFile(normalizedPath, file.content)
        writtenFiles.add(normalizedPath)
        results.filesCreated.push(normalizedPath)

        if (normalizedPath.includes('App.')) {
          appContent = file.content
        }

        if (globalThis.existingFiles instanceof Set) {
          ;(globalThis.existingFiles as unknown as Set<string>).add(normalizedPath)
        }

        await onProgress({ type: 'file-complete', fileName: normalizedPath, action: 'created' })
      } catch (e) {
        console.error(`Failed to write file ${normalizedPath}:`, e)
        results.errors.push(`Failed to write ${normalizedPath}: ${(e as Error).message}`)
      }
    }
  }

  const importedComponents = extractComponentImports(appContent)
  const componentMap = new Map<string, string>()

  for (const comp of importedComponents) {
    componentMap.set(comp.name, comp.path)
  }

  console.log(`[applyAiCodeStream] Components to generate:`, Array.from(componentMap.entries()))

  const generatedComponents = new Map<string, string>()

  for (const [componentName, componentPath] of componentMap) {
    await onProgress({
      type: 'step',
      step: 3,
      message: `Generating ${componentName} component...`,
      packages: [],
    })

    const componentResult = await generateComponent(
      componentName,
      componentPath,
      appContent,
      generatedComponents,
      prompt,
      model,
      provider,
      onProgress
    )

    if (componentResult.success && componentResult.content && componentResult.filePath) {
      // Write the component file to the correct path
      const finalPath = componentResult.filePath

      try {
        const dirPath = finalPath.includes('/')
          ? finalPath.substring(0, finalPath.lastIndexOf('/'))
          : ''
        if (dirPath) await provider.runCommand(`mkdir -p ${dirPath}`)

        await provider.writeFile(finalPath, componentResult.content)

        writtenFiles.add(finalPath)
        results.filesCreated.push(finalPath)
        generatedComponents.set(componentName, componentResult.content)

        if (globalThis.existingFiles instanceof Set) {
          ;(globalThis.existingFiles as unknown as Set<string>).add(finalPath)
        }

        await onProgress({ type: 'file-complete', fileName: finalPath, action: 'created' })

        const buildCheck = await provider.runCommand('npx --yes vite build')
        if (buildCheck.exitCode !== 0) {
          console.warn(
            `[applyAiCodeStream] Component ${componentName} has build errors, attempting fix...`
          )

          const fixResult = await generateComponent(
            componentName,
            componentPath,
            appContent,
            generatedComponents,
            prompt + `\n\nPrevious attempt had errors:\n${buildCheck.stderr}`,
            model,
            provider,
            onProgress
          )

          if (fixResult.success && fixResult.content && fixResult.filePath) {
            await provider.writeFile(fixResult.filePath, fixResult.content)
            generatedComponents.set(componentName, fixResult.content)
          }
        }
      } catch (e) {
        console.error(`Failed to write component ${componentName}:`, e)
        results.errors.push(`Failed to create ${componentName}: ${(e as Error).message}`)
      }
    } else {
      results.errors.push(`Failed to generate ${componentName}: ${componentResult.error}`)
    }
  }

  const fullParsed = parseAIResponse(generatedCode)

  const packagesArray = Array.isArray(packages) ? packages : []
  const parsedPackages = Array.isArray(fullParsed.packages) ? fullParsed.packages : []
  const allPackages = [
    ...packagesArray.filter((p) => p && typeof p === 'string'),
    ...parsedPackages,
    ...packagesToInstall,
  ]
  const uniquePackages = [...new Set(allPackages)]
    .filter((p) => p && typeof p === 'string' && p.trim() !== '')
    .filter((p) => p !== 'react' && p !== 'react-dom')

  if (uniquePackages.length > 0) {
    await onProgress({
      type: 'step',
      step: 1,
      message: `Installing ${uniquePackages.length} packages...`,
      packages: uniquePackages,
    })
    try {
      const installResult = await provider.installPackages(uniquePackages)
      results.packagesInstalled = installResult.success ? uniquePackages : []
      await onProgress({
        type: 'package-progress',
        message: installResult.stdout,
        installedPackages: results.packagesInstalled,
      })
    } catch (e) {
      const err = e as Error
      results.errors.push(`Package installation failed: ${err.message}`)
      await onProgress({
        type: 'warning',
        message: `Package installation skipped (${err.message}). Continuing...`,
      })
    }
  }

  const filesArray = Array.isArray(fullParsed.files) ? fullParsed.files : []

  results.filesCreated = Array.from(writtenFiles)

  const configFiles = new Set([
    'tailwind.config.js',
    'vite.config.js',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'postcss.config.js',
  ])

  const isTypeScriptProject =
    globalThis.existingFiles instanceof Set &&
    ((globalThis.existingFiles as unknown as Set<string>).has('tsconfig.json') ||
      Array.from(globalThis.existingFiles as unknown as Set<string>).some(
        (p) => p.endsWith('.ts') || p.endsWith('.tsx')
      ))

  const filteredFiles = filesArray.filter((file) => {
    if (!file || typeof file !== 'object') return false
    const fileName = (file.path || '').split('/').pop() || ''
    if (configFiles.has(fileName)) return false

    let normalizedPath = file.path
    if (normalizedPath.startsWith('/')) normalizedPath = normalizedPath.substring(1)
    if (isTypeScriptProject && normalizedPath.endsWith('.jsx')) {
      normalizedPath = normalizedPath.replace(/\.jsx$/, '.tsx')
    }
    if (
      !normalizedPath.startsWith('src/') &&
      !normalizedPath.startsWith('public/') &&
      normalizedPath !== 'index.html'
    ) {
      normalizedPath = `src/${normalizedPath}`
    }

    return !writtenFiles.has(normalizedPath)
  })

  if (filteredFiles.length > 0) {
    await onProgress({
      type: 'step',
      step: 2,
      message: `Processing ${filteredFiles.length} additional files...`,
      packages: [],
    })
  }

  for (let i = 0; i < filteredFiles.length; i++) {
    const file = filteredFiles[i]
    try {
      await onProgress({
        type: 'file-progress',
        current: i + 1,
        total: filteredFiles.length,
        fileName: file.path,
        action: 'creating',
      })

      let normalizedPath = file.path
      if (normalizedPath.startsWith('/')) normalizedPath = normalizedPath.substring(1)
      if (
        !normalizedPath.startsWith('src/') &&
        !normalizedPath.startsWith('public/') &&
        normalizedPath !== 'index.html' &&
        !configFiles.has(normalizedPath.split('/').pop() || '')
      ) {
        normalizedPath = `src/${normalizedPath}`
      }

      if (isTypeScriptProject && /\.jsx$/.test(normalizedPath)) {
        normalizedPath = normalizedPath.replace(/\.jsx$/, '.tsx')
      }

      if (
        isTypeScriptProject &&
        (normalizedPath.endsWith('/App.jsx') || normalizedPath.endsWith('App.jsx')) &&
        (globalThis.existingFiles as unknown as Set<string>).has(
          normalizedPath.replace(/App\.jsx$/, 'App.tsx')
        )
      ) {
        normalizedPath = normalizedPath.replace(/App\.jsx$/, 'App.tsx')
      }

      const isUpdate =
        globalThis.existingFiles instanceof Set && globalThis.existingFiles.has(normalizedPath)

      let fileContent = file.content
      if (/\.(jsx?|tsx?)$/.test(file.path)) {
        fileContent = fileContent.replace(/import\s+['"]\.\/[^'"]+\.css['"];?\s*\n?/g, '')
      }
      if (/\.css$/.test(file.path)) {
        fileContent = fileContent
          .replace(/shadow-3xl/g, 'shadow-2xl')
          .replace(/shadow-4xl/g, 'shadow-2xl')
          .replace(/shadow-5xl/g, 'shadow-2xl')
      }

      const dirPath = normalizedPath.includes('/')
        ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/'))
        : ''
      if (dirPath) await provider.runCommand(`mkdir -p ${dirPath}`)

      await provider.writeFile(normalizedPath, fileContent)

      if (isUpdate) {
        results.filesUpdated.push(normalizedPath)
      } else {
        if (!results.filesCreated.includes(normalizedPath)) {
          results.filesCreated.push(normalizedPath)
        }
        if (globalThis.existingFiles instanceof Set) {
          ;(globalThis.existingFiles as unknown as Set<string>).add(normalizedPath)
        }
      }

      await onProgress({
        type: 'file-complete',
        fileName: normalizedPath,
        action: isUpdate ? 'updated' : 'created',
      })
    } catch (e) {
      const err = e as Error
      results.errors.push(`Failed to create ${file.path}: ${err.message}`)
      await onProgress({ type: 'file-error', fileName: file.path, error: err.message })
    }
  }

  const commandsArray = Array.isArray(fullParsed.commands) ? fullParsed.commands : []
  if (commandsArray.length > 0) {
    await onProgress({
      type: 'step',
      step: 3,
      message: `Executing ${commandsArray.length} commands...`,
      packages: [],
    })
    for (let i = 0; i < commandsArray.length; i++) {
      const cmd = commandsArray[i]
      try {
        await onProgress({
          type: 'command-progress',
          current: i + 1,
          total: commandsArray.length,
          command: cmd,
          action: 'executing',
        })
        const result = await provider.runCommand(cmd)
        if (result.stdout)
          await onProgress({
            type: 'command-output',
            command: cmd,
            output: result.stdout,
            stream: 'stdout',
          })
        if (result.stderr)
          await onProgress({
            type: 'command-output',
            command: cmd,
            output: result.stderr,
            stream: 'stderr',
          })
        results.commandsExecuted.push(cmd)
        await onProgress({
          type: 'command-complete',
          command: cmd,
          exitCode: result.exitCode,
          success: result.exitCode === 0,
        })
      } catch (e) {
        const err = e as Error
        results.errors.push(`Failed to execute ${cmd}: ${err.message}`)
        await onProgress({ type: 'command-error', command: cmd, error: err.message })
      }
    }
  }

  try {
    if (isTypeScriptProject) {
      await onProgress({ type: 'step', step: 4, message: 'Type checking project...', packages: [] })
      const typecheck = await provider.runCommand('npx --yes tsc --noEmit')
      if (typecheck.exitCode !== 0) {
        results.errors.push('Typecheck failed')
        if (typecheck.stdout)
          await onProgress({
            type: 'command-output',
            command: 'tsc',
            output: typecheck.stdout,
            stream: 'stdout',
          })
        if (typecheck.stderr)
          await onProgress({
            type: 'command-output',
            command: 'tsc',
            output: typecheck.stderr,
            stream: 'stderr',
          })
        await onProgress({
          type: 'warning',
          message: 'Type errors detected. Fixing may be required.',
        })
      }
    }

    await onProgress({ type: 'step', step: 5, message: 'Building project...', packages: [] })
    let build = await provider.runCommand('npm run build')
    if (build.exitCode !== 0) {
      build = await provider.runCommand('npx --yes vite build')
    }
    if (build.stdout)
      await onProgress({
        type: 'command-output',
        command: 'build',
        output: build.stdout,
        stream: 'stdout',
      })
    if (build.stderr)
      await onProgress({
        type: 'command-output',
        command: 'build',
        output: build.stderr,
        stream: 'stderr',
      })
    if (build.exitCode !== 0) {
      results.errors.push('Build failed')
      await onProgress({
        type: 'warning',
        message: 'Build failed. Preview may not reflect changes until issues are fixed.',
      })
    }
  } catch (validationError) {
    results.errors.push(`Validation step failed: ${(validationError as Error).message}`)
    await onProgress({ type: 'warning', message: 'Validation step encountered an error.' })
  }

  const extractErrorPaths = (out: string): string[] => {
    const paths: Set<string> = new Set()
    const appRoot = '/home/user/app/'

    const pattern1 = /\n\/?home\/user\/app\/([^\s:'"\\)]+):(\d+):(\d+)/g
    const pattern2 = /from\s+"\/?home\/user\/app\/([^"']+)"/g
    const pattern3 = /from\s+"([^"]+)"/g
    const pattern4 = /\/home\/user\/app\/([^:\s]+):\d+:\d+:/g
    const pattern5 = /Failed to resolve import ["']([^"']+)["'] from ["']([^"']+)["']/g
    const pattern6 = /Transform failed.*?\n.*?\/home\/user\/app\/([^:\s]+):/g

    let m: RegExpExecArray | null
    while ((m = pattern1.exec(out)) !== null) paths.add(m[1])
    while ((m = pattern2.exec(out)) !== null) paths.add(m[1])
    while ((m = pattern3.exec(out)) !== null) {
      const p = m[1]
      if (p.startsWith('/home/user/app/')) paths.add(p.slice(appRoot.length))
    }
    while ((m = pattern4.exec(out)) !== null) paths.add(m[1])
    while ((m = pattern5.exec(out)) !== null) {
      const issuer = m[2]
      if (issuer.startsWith('/home/user/app/')) paths.add(issuer.slice(appRoot.length))
    }
    while ((m = pattern6.exec(out)) !== null) paths.add(m[1])

    return Array.from(paths)
  }

  /**
   * Run LLM-guided repair for build errors
   * Analyzes errors and generates fixes for common issues
   */
  const runLLMRepairRound = async (
    errorOut: string
  ): Promise<{ changedFiles: string[]; success: boolean; stdout: string; stderr: string }> => {
    const affected = extractErrorPaths(errorOut)
    const filesForContext: Array<{ path: string; content: string }> = []
    for (const rel of affected) {
      try {
        const content = await provider.readFile(rel)
        filesForContext.push({ path: rel, content })
      } catch {
        // ignore missing
      }
    }

    const lucideErrors = errorOut.match(/does not provide an export named '([^']+)'/g)
    const invalidLucideIcons = lucideErrors
      ? lucideErrors
          .map((err) => {
            const match = err.match(/does not provide an export named '([^']+)'/)
            return match ? match[1] : null
          })
          .filter(Boolean)
      : []

    const repairSystemPrompt = `You are a senior React + Vite developer. Fix ALL build and runtime errors by:
1. Fixing syntax errors in existing files
2. Creating ANY missing files that are imported but don't exist
3. For missing React components, create proper functional components with TypeScript
4. Fixing browser console errors like:
   - Uncaught TypeError/ReferenceError
   - Module resolution errors at runtime
   - React component errors (hooks, props, state)
   - Event handler errors
   - API call failures
   - Import/export mismatches that cause runtime failures
5. **CRITICAL: Fix invalid lucide-react icon imports**
   - Replace invalid icon names with 'Activity' as a safe default
   - Only use valid lucide-react icon names that actually exist in the library

IMPORTANT: 
- If a file is imported but doesn't exist, you MUST create that file with appropriate content
- Fix console.error() calls that indicate runtime problems
- Ensure all React components are properly exported and imported
- Fix any undefined variables or functions
- Handle missing props or incorrect prop types
- Fix event handlers that reference non-existent functions
- **REPLACE INVALID LUCIDE ICONS**: If you see imports that don't exist in lucide-react, replace them with 'Activity' as a safe default.

Return ALL files (both fixed existing files AND new files to create) in <file path="...">content</file> format.`

    const repairUserPromptParts: string[] = []
    repairUserPromptParts.push('BUILD/TYPE ERRORS:')
    repairUserPromptParts.push('```log')
    repairUserPromptParts.push(errorOut.substring(0, 8000)) // Increased to capture more context
    repairUserPromptParts.push('```')

    const missingImports = [...errorOut.matchAll(/Failed to resolve import ["']([^"']+)["']/g)].map(
      (m) => m[1]
    )

    if (missingImports.length > 0) {
      repairUserPromptParts.push('\nMISSING IMPORTS DETECTED:')
      for (const imp of missingImports) {
        repairUserPromptParts.push(`- ${imp}`)
      }
      repairUserPromptParts.push('\nThese files need to be CREATED.')
    }

    if (invalidLucideIcons.length > 0) {
      repairUserPromptParts.push('\n🚨 INVALID LUCIDE-REACT ICONS DETECTED:')
      for (const icon of invalidLucideIcons) {
        repairUserPromptParts.push(`- "${icon}" does not exist in lucide-react`)
      }
      repairUserPromptParts.push('\nYou MUST replace these with valid lucide-react icons.')
    }

    if (filesForContext.length > 0) {
      repairUserPromptParts.push('\nEXISTING FILES WITH ERRORS:')
      for (const f of filesForContext) {
        repairUserPromptParts.push(`<file path="${f.path}">\n${f.content}\n</file>`)
      }
    }

    const repairOptions = {
      model: (await getAIProvider(model))(actualModel),
      messages: [
        { role: 'system', content: repairSystemPrompt },
        { role: 'user', content: repairUserPromptParts.join('\n') },
      ],
      maxTokens: 8192, // Increased to allow creating multiple missing files
    }

    await onProgress({ type: 'step', step: 5, message: 'LLM fixing build errors...', packages: [] })
    let llmText = ''
    try {
      const r = streamText(repairOptions as Parameters<typeof streamText>[0])
      for await (const part of r?.textStream || []) llmText += part || ''
    } catch (e) {
      results.errors.push(`LLM repair failed: ${(e as Error).message}`)
      return { changedFiles: [], success: false, stdout: '', stderr: '' }
    }

    const parsedFix = parseAIResponse(llmText)
    const changed: string[] = []
    for (const file of parsedFix.files) {
      try {
        let normalized = file.path.replace(/^\/+/, '')

        if (normalized.startsWith('components/') && !normalized.includes('.')) {
          normalized = `src/${normalized}.tsx`
        } else if (
          !normalized.startsWith('src/') &&
          !normalized.startsWith('public/') &&
          normalized !== 'index.html'
        ) {
          normalized = `src/${normalized}`
        }

        if (isTypeScriptProject && normalized.endsWith('.jsx')) {
          normalized = normalized.replace(/\.jsx$/, '.tsx')
        }

        const dir = normalized.includes('/')
          ? normalized.substring(0, normalized.lastIndexOf('/'))
          : ''
        if (dir) await provider.runCommand(`mkdir -p ${dir}`)

        await provider.writeFile(normalized, file.content)
        changed.push(normalized)

        const isNew = !(globalThis.existingFiles as unknown as Set<string>).has(normalized)
        if (globalThis.existingFiles instanceof Set)
          (globalThis.existingFiles as unknown as Set<string>).add(normalized)

        await onProgress({
          type: 'file-complete',
          fileName: normalized,
          action: isNew ? 'created' : 'updated',
        })
      } catch (e) {
        results.errors.push(`Failed to write repair ${file.path}: ${(e as Error).message}`)
      }
    }

    const rebuild = await provider.runCommand('npx --yes vite build')
    if (rebuild.stdout)
      await onProgress({
        type: 'command-output',
        command: 'build',
        output: rebuild.stdout,
        stream: 'stdout',
      })
    if (rebuild.stderr)
      await onProgress({
        type: 'command-output',
        command: 'build',
        output: rebuild.stderr,
        stream: 'stderr',
      })
    const ok = rebuild.exitCode === 0
    if (!ok) results.errors.push('Build still failing after LLM repair')
    return { changedFiles: changed, success: ok, stdout: rebuild.stdout, stderr: rebuild.stderr }
  }

  /**
   * Create placeholder files for missing imports
   * Prevents build failures from missing dependencies
   */
  const ensureImportsExist = async (): Promise<void> => {
    const createMinimalComponent = (name: string, ts: boolean): string => {
      const safe = name.match(/^[A-Za-z_][A-Za-z0-9_]*/) ? name : 'Component'
      if (ts) {
        return `import React from 'react'\n\nexport default function ${safe}(): JSX.Element {\n  return (\n    <div className="p-4 text-gray-600">${safe} placeholder</div>\n  )\n}\n`
      }
      return `import React from 'react'\n\nexport default function ${safe}() {\n  return (\n    <div className="p-4 text-gray-600">${safe} placeholder</div>\n  )\n}\n`
    }

    const placeholderForExt = (ext: string): string => {
      switch (ext) {
        case 'css':
          return `/* auto-generated */\n:root {}\n`
        case 'scss':
        case 'sass':
          return `/* auto-generated */\n$primary: #333;\nbody { color: $primary; }\n`
        case 'svg':
          return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"></svg>\n`
        case 'json':
          return `{}\n`
        case 'md':
        case 'txt':
          return `# Auto-generated\n`
        default:
          return ''
      }
    }

    const allFiles = await provider.listFiles('/home/user/app')
    const hasFile = (path: string): boolean => allFiles.includes(path)

    const ensureDir = async (filePath: string): Promise<void> => {
      const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : ''
      if (dir) await provider.runCommand(`mkdir -p ${dir}`)
    }

    for (const file of allFiles) {
      if (
        !(
          file.endsWith('.tsx') ||
          file.endsWith('.jsx') ||
          file.endsWith('.ts') ||
          file.endsWith('.js')
        )
      )
        continue
      let content = ''
      try {
        content = await provider.readFile(file)
      } catch {
        continue
      }

      const importFrom = /import\s+[^'"\n]+\s+from\s+['"]([^'"\n]+)['"]/g
      const importSide = /import\s+['"]([^'"\n]+)['"]/g

      const imports: string[] = []
      let m: RegExpExecArray | null
      while ((m = importFrom.exec(content)) !== null) imports.push(m[1])
      while ((m = importSide.exec(content)) !== null) imports.push(m[1])

      const basePath = file.includes('/') ? file.substring(0, file.lastIndexOf('/')) : ''

      for (const spec of imports) {
        // Only handle relative and @/ alias; skip node_modules
        if (!(spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('@/'))) continue

        const specMapped = spec.startsWith('~/')
          ? spec.replace(/^~\//, 'src/')
          : spec.startsWith('@/')
            ? spec.replace(/^@\//, 'src/')
            : spec

        const resolveRelative = (issuerPath: string, importPath: string): string => {
          if (importPath.startsWith('src/')) return importPath
          if (importPath.startsWith('./'))
            return basePath ? `${basePath}/${importPath.substring(2)}` : importPath.substring(2)
          if (!importPath.startsWith('../')) return importPath
          const parts = issuerPath.split('/').filter(Boolean).slice(0, -1)
          const importParts = importPath.split('/')
          for (const part of importParts) {
            if (part === '..') {
              if (parts.length > 0) parts.pop()
            } else if (part !== '.') {
              parts.push(part)
            }
          }
          return parts.join('/')
        }

        const resolved = resolveRelative(file, specMapped)
        if (!resolved) continue

        const tryPaths: string[] = [resolved]
        const extList = ['.tsx', '.ts', '.jsx', '.js', '.css', '.scss', '.sass']
        for (const ext of extList) tryPaths.push(`${resolved}${ext}`)
        for (const idx of ['index.tsx', 'index.ts', 'index.jsx', 'index.js'])
          tryPaths.push(`${resolved.endsWith('/') ? resolved : resolved + '/'}${idx}`)

        const exists = tryPaths.some((p) => hasFile(p) || hasFile(`/home/user/app/${p}`))
        if (exists) continue

        let target = resolved
        const lastDot = target.lastIndexOf('.')
        const hasExt = lastDot > target.lastIndexOf('/')
        let ext = hasExt ? target.slice(lastDot + 1).toLowerCase() : ''
        if (!hasExt) {
          const isComponentLike =
            target.includes('/components/') || /^[A-Z]/.test(target.split('/').pop() || '')
          if (isComponentLike) target = isTypeScriptProject ? `${target}.tsx` : `${target}.jsx`
          else target = `${target}.css`
          ext = target.slice(target.lastIndexOf('.') + 1).toLowerCase()
        }

        if (
          !target.startsWith('src/') &&
          !target.startsWith('public/') &&
          target !== 'index.html'
        ) {
          target = `src/${target}`
        }

        await ensureDir(target)
        const contentOut = ['css', 'scss', 'sass', 'svg', 'json', 'md', 'txt'].includes(ext)
          ? placeholderForExt(ext)
          : createMinimalComponent(
              (target.split('/').pop() || 'Component').replace(/\.[^.]+$/, ''),
              isTypeScriptProject
            )
        await provider.writeFile(target, contentOut)
        if (globalThis.existingFiles instanceof Set)
          (globalThis.existingFiles as unknown as Set<string>).add(target)
        await onProgress({ type: 'file-complete', fileName: target, action: 'created' })
      }
    }
  }

  /**
   * Validate and repair import/export mismatches
   * Fixes common module resolution issues
   */
  const validateImportExportAndRepair = async (): Promise<{ fixes: number; notes: string[] }> => {
    const notes: string[] = []
    let fixes = 0

    const allFiles = await provider.listFiles('/home/user/app')
    const readFileSafe = async (path: string): Promise<string> => {
      try {
        return await provider.readFile(path)
      } catch {
        return ''
      }
    }

    const resolveAlias = (spec: string): string => {
      if (spec.startsWith('~/')) return spec.replace(/^~\//, 'src/')
      if (spec.startsWith('@/')) return spec.replace(/^@\//, 'src/')
      return spec
    }

    const resolveRelative = (issuer: string, spec: string): string => {
      const base = issuer.includes('/') ? issuer.substring(0, issuer.lastIndexOf('/')) : ''
      if (spec.startsWith('src/')) return spec
      if (spec.startsWith('./')) return base ? `${base}/${spec.substring(2)}` : spec.substring(2)
      if (!spec.startsWith('../')) return spec
      const parts = base.split('/').filter(Boolean)
      const segs = spec.split('/')
      let i = 0
      while (i < segs.length && segs[i] === '..') {
        if (parts.length > 0) parts.pop()
        i++
      }
      const rest = segs.slice(i).join('/')
      return parts.length ? `${parts.join('/')}/${rest}` : rest
    }

    const tryResolveTarget = (resolved: string): string | null => {
      const candidates: string[] = [
        resolved,
        `${resolved}.tsx`,
        `${resolved}.ts`,
        `${resolved}.jsx`,
        `${resolved}.js`,
        `${resolved}/index.tsx`,
        `${resolved}/index.ts`,
        `${resolved}/index.jsx`,
        `${resolved}/index.js`,
      ]
      for (const c of candidates) {
        if (allFiles.includes(c) || allFiles.includes(`/home/user/app/${c}`))
          return c.startsWith('/home/user/app/') ? c.slice('/home/user/app/'.length) : c
      }
      return null
    }

    const parseImports = (
      code: string
    ): Array<{ line: string; source: string; hasDefault: boolean; named: string[] }> => {
      const imports: Array<{ line: string; source: string; hasDefault: boolean; named: string[] }> =
        []
      const regex = /import\s+([^'"\n;]+)\s+from\s+['"]([^'"\n]+)['"]/g
      let m: RegExpExecArray | null
      while ((m = regex.exec(code)) !== null) {
        const clause = m[1].trim()
        const source = m[2].trim()
        let hasDefault = false
        const named: string[] = []
        if (clause.startsWith('{')) {
          // only named
          const inner = clause.replace(/[{}]/g, '')
          for (const part of inner.split(',')) {
            const name = part.trim().split(' as ')[0].trim()
            if (name) named.push(name)
          }
        } else if (clause.includes('{')) {
          // default + named
          hasDefault = true
          const inner = clause.substring(clause.indexOf('{')).replace(/[{}]/g, '')
          for (const part of inner.split(',')) {
            const name = part.trim().split(' as ')[0].trim()
            if (name) named.push(name)
          }
        } else {
          // only default
          hasDefault = true
        }
        imports.push({ line: m[0], source, hasDefault, named })
      }
      // side-effect imports are not relevant here
      return imports
    }

    const parseExports = (
      code: string
    ): { hasDefault: boolean; named: Set<string>; localNames: Set<string> } => {
      const named = new Set<string>()
      const localNames = new Set<string>()
      let hasDefault = false
      // default
      if (/export\s+default\s+/m.test(code)) hasDefault = true
      // named forms
      const reNamed = /(export\s+(?:const|let|var|function|class)\s+)([A-Za-z_][A-Za-z0-9_]*)/g
      let m: RegExpExecArray | null
      while ((m = reNamed.exec(code)) !== null) named.add(m[2])
      // export list: export { A, B as C }
      const reList = /export\s*\{([^}]+)\}/g
      while ((m = reList.exec(code)) !== null) {
        for (const part of m[1].split(',')) {
          const left = part.trim().split(' as ')[0].trim()
          if (left) named.add(left)
        }
      }
      // locals to help add default
      const reLocals = /(const|let|var|function|class)\s+([A-Za-z_][A-Za-z0-9_]*)/g
      while ((m = reLocals.exec(code)) !== null) localNames.add(m[2])
      return { hasDefault, named, localNames }
    }

    const appendDefaultExport = (code: string, nameGuess: string): string =>
      `${code}\nexport default ${nameGuess}\n`

    for (const importer of allFiles) {
      if (
        !(
          importer.endsWith('.tsx') ||
          importer.endsWith('.jsx') ||
          importer.endsWith('.ts') ||
          importer.endsWith('.js')
        )
      )
        continue
      const importerCode = await readFileSafe(importer)
      if (!importerCode) continue
      const imports = parseImports(importerCode)
      for (const imp of imports) {
        const srcRaw = resolveAlias(imp.source)
        if (!(srcRaw.startsWith('./') || srcRaw.startsWith('../') || srcRaw.startsWith('src/')))
          continue
        const resolved = tryResolveTarget(resolveRelative(importer, srcRaw))
        if (!resolved) continue
        const targetCode = await readFileSafe(resolved)
        if (!targetCode) continue
        const ex = parseExports(targetCode)

        if (imp.hasDefault && !ex.hasDefault) {
          const base = resolved.split('/').pop() || 'Component'
          const baseName = base.replace(/\.[^.]+$/, '') || 'Component'
          const candidates: string[] = []
          if (ex.named.has(baseName)) candidates.push(baseName)
          for (const n of ex.named) {
            candidates.push(n)
            break
          }
          for (const n of ex.localNames) {
            candidates.push(n)
            break
          }
          const pick = candidates.find(Boolean) || 'Component'
          const updated = appendDefaultExport(targetCode, pick)
          await provider.writeFile(resolved, updated)
          fixes++
          notes.push(`Added default export to ${resolved} as ${pick}`)
          await onProgress({ type: 'file-complete', fileName: resolved, action: 'updated' })
          continue
        }

        const missingNamed = imp.named.filter((n) => !ex.named.has(n))
        if (missingNamed.length > 0) {
          if (
            ex.hasDefault &&
            missingNamed.length === imp.named.length &&
            imp.named.length === 1 &&
            !imp.hasDefault
          ) {
            const missing = imp.named[0]
            const newLine = imp.line
              .replace(/import\s*\{\s*[^}]+\s*\}\s*from/, 'import')
              .replace(missing, 'default')
            const rewritten = importerCode.replace(imp.line, newLine)
            await provider.writeFile(importer, rewritten)
            fixes++
            notes.push(`Rewrote named import to default in ${importer} for ${resolved}`)
            await onProgress({ type: 'file-complete', fileName: importer, action: 'updated' })
          } else {
            const base = resolved.split('/').pop() || 'Component'
            const baseName = base.replace(/\.[^.]+$/, '') || 'Component'
            const pick = ex.named.has(baseName)
              ? baseName
              : Array.from(ex.named)[0] || Array.from(ex.localNames)[0] || 'Component'
            const updated = ex.hasDefault ? targetCode : appendDefaultExport(targetCode, pick)
            await provider.writeFile(resolved, updated)
            fixes++
            notes.push(`Ensured default export exists in ${resolved} to satisfy imports`)
            await onProgress({ type: 'file-complete', fileName: resolved, action: 'updated' })
          }
        }
      }
    }

    return { fixes, notes }
  }

  /**
   * Validate and fix lucide-react icon imports
   * Replaces invalid icon names with valid alternatives
   */
  const validateLucideImports = async (): Promise<{ fixes: number; invalidIcons: string[] }> => {
    const commonValidIcons = new Set([
      'Heart',
      'Star',
      'User',
      'Home',
      'Settings',
      'Search',
      'Menu',
      'X',
      'ChevronDown',
      'ChevronRight',
      'Plus',
      'Minus',
      'Check',
      'AlertCircle',
      'Info',
      'Calendar',
      'Clock',
      'Mail',
      'Phone',
      'MapPin',
      'Camera',
      'Image',
      'File',
      'Folder',
      'Download',
      'Upload',
      'Edit',
      'Trash',
      'Save',
      'Share',
      'Copy',
      'Link',
      'ExternalLink',
      'Eye',
      'EyeOff',
      'Lock',
      'Unlock',
      'Shield',
      'Zap',
      'Activity',
      'TrendingUp',
      'BarChart',
      'PieChart',
      'Target',
      'Award',
      'Trophy',
      'Flag',
      'Bookmark',
      'Tag',
      'Filter',
      'Sort',
      'Grid',
      'List',
      'Play',
      'Pause',
      'Stop',
      'SkipForward',
      'SkipBack',
      'Volume2',
      'VolumeX',
      'Wifi',
      'Battery',
      'Signal',
      'Bluetooth',
      'Cpu',
      'HardDrive',
      'Monitor',
      'Smartphone',
      'Tablet',
      'Laptop',
      'Server',
      'Database',
      'Cloud',
      'Globe',
      'Navigation',
      'Compass',
      'Map',
      'Car',
      'Plane',
      'Train',
      'Bike',
      'Walk',
      'Run',
      'Dumbbell',
      'Weight',
      'Flame',
      'Droplet',
      'Sun',
      'Moon',
      'CloudRain',
      'Snowflake',
      'Wind',
      'Thermometer',
      'Umbrella',
      'Rainbow',
      'Sunrise',
      'Sunset',
    ])

    let fixes = 0
    const invalidIcons: string[] = []

    try {
      const allFiles = await provider.listFiles('/home/user/app')
      for (const file of allFiles) {
        if (
          file.endsWith('.tsx') ||
          file.endsWith('.jsx') ||
          file.endsWith('.ts') ||
          file.endsWith('.js')
        ) {
          try {
            const content = await provider.readFile(file)
            const lucideImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g
            let match
            let hasChanges = false
            let updatedContent = content

            while ((match = lucideImportRegex.exec(content)) !== null) {
              const imports = match[1].split(',').map((imp) => imp.trim())
              const validImports: string[] = []

              for (const imp of imports) {
                const iconName = imp.trim()
                if (commonValidIcons.has(iconName)) {
                  validImports.push(iconName)
                } else {
                  const defaultIcon = 'Activity'
                  validImports.push(defaultIcon)
                  const usageRegex = new RegExp(`\\b${iconName}\\b`, 'g')
                  updatedContent = updatedContent.replace(usageRegex, defaultIcon)
                  invalidIcons.push(iconName)
                  hasChanges = true
                  fixes++
                }
              }

              if (hasChanges) {
                // Update the import statement
                const newImport = `import { ${validImports.join(', ')} } from 'lucide-react'`
                updatedContent = updatedContent.replace(match[0], newImport)
              }
            }

            if (hasChanges) {
              await provider.writeFile(file, updatedContent)
              await onProgress({ type: 'file-complete', fileName: file, action: 'updated' })
            }
          } catch {
            // Skip files we can't read
          }
        }
      }
    } catch {
      // Skip validation if file listing fails
    }

    return { fixes, invalidIcons }
  }

  /**
   * Comprehensive error detection and repair
   * Runs multiple validation passes and fixes common issues
   */
  const performErrorDetectionAndRepair = async (): Promise<void> => {
    let allErrors = ''

    // Validate lucide-react imports first
    try {
      const lucideResult = await validateLucideImports()
      if (lucideResult.fixes > 0) {
        await onProgress({
          type: 'warning',
          message: `Auto-fixed ${lucideResult.fixes} invalid lucide-react icons`,
        })
      }
    } catch {
      // best-effort
    }

    // Preflight: create placeholders for missing imports before first build
    try {
      await ensureImportsExist()
    } catch {
      // best-effort
    }

    // Validate import/export compatibility before first build
    try {
      const res = await validateImportExportAndRepair()
      if (res.fixes > 0) {
        await onProgress({
          type: 'warning',
          message: `Auto-fixed ${res.fixes} import/export mismatches`,
        })
      }
    } catch {
      // best-effort
    }

    const buildResult = await provider.runCommand('npx --yes vite build')
    allErrors += `${buildResult.stdout || ''}\n${buildResult.stderr || ''}\n`

    try {
      const allFiles = await provider.listFiles('/home/user/app')
      for (const file of allFiles) {
        if (
          file.endsWith('.tsx') ||
          file.endsWith('.jsx') ||
          file.endsWith('.ts') ||
          file.endsWith('.js')
        ) {
          try {
            const content = await provider.readFile(file)
            const importRegex = /import\s+.*?\s+from\s+['"](\.[^'"]+)['"]/g
            let match
            while ((match = importRegex.exec(content)) !== null) {
              const importPath = match[1]
              const basePath = file.includes('/') ? file.substring(0, file.lastIndexOf('/')) : ''
              let resolvedPath = importPath

              if (importPath.startsWith('./')) {
                resolvedPath = basePath
                  ? `${basePath}/${importPath.substring(2)}`
                  : importPath.substring(2)
              } else if (importPath.startsWith('../')) {
                const parts = basePath.split('/').filter((p) => p)
                const importParts = importPath.split('/')
                let upCount = 0
                for (const part of importParts) {
                  if (part === '..') upCount++
                  else break
                }
                const remainingPath = importParts.slice(upCount).join('/')
                const newBase = parts.slice(0, Math.max(0, parts.length - upCount)).join('/')
                resolvedPath = newBase ? `${newBase}/${remainingPath}` : remainingPath
              }

              const extensions = [
                '',
                '.tsx',
                '.jsx',
                '.ts',
                '.js',
                '/index.tsx',
                '/index.jsx',
                '/index.ts',
                '/index.js',
              ]
              let found = false
              for (const ext of extensions) {
                const checkPath = `${resolvedPath}${ext}`
                if (allFiles.includes(checkPath)) {
                  found = true
                  break
                }
              }

              if (!found) {
                allErrors += `Missing import: "${importPath}" in "${file}" (resolved to "${resolvedPath}")\n`
              }
            }
          } catch {
            // Skip files we can't read
          }
        }
      }
    } catch {
      // Skip import validation if file listing fails
    }

    const hasErrors =
      buildResult.exitCode !== 0 ||
      allErrors.includes('Failed to resolve import') ||
      allErrors.includes('Missing import:') ||
      allErrors.includes('Cannot resolve module') ||
      allErrors.includes('Transform failed') ||
      allErrors.includes('ERROR:') ||
      allErrors.includes('Expected ') ||
      allErrors.includes('Unexpected ') ||
      allErrors.includes('Unterminated ') ||
      allErrors.includes('SyntaxError') ||
      allErrors.includes('does not provide an export named') ||
      allErrors.includes('Uncaught SyntaxError') ||
      allErrors.includes('[plugin:vite:') ||
      allErrors.includes('[plugin:esbuild')

    if (hasErrors) {
      await onProgress({
        type: 'warning',
        message: 'Detected build/syntax/import errors, attempting repairs...',
      })

      for (let i = 0; i < 2; i++) {
        const res = await runLLMRepairRound(allErrors)
        const stillHasErrors =
          !res.success ||
          res.stdout?.includes('Failed to resolve import') ||
          res.stderr?.includes('Failed to resolve import') ||
          res.stdout?.includes('Transform failed') ||
          res.stderr?.includes('Transform failed') ||
          res.stdout?.includes('ERROR:') ||
          res.stderr?.includes('ERROR:')

        if (res.success && !stillHasErrors) {
          break
        }
        allErrors = `${res.stdout || ''}\n${res.stderr || ''}\n`
      }
    }
  }

  try {
    await performErrorDetectionAndRepair()
  } catch (error) {
    console.warn('[applyAiCodeStream] Error detection failed:', error)
  }

  /**
   * Auto-repair missing imports and rebuild
   * Handles Vite import resolution errors
   */
  const tryAutoRepairAndRebuild = async (rawOut: string, rawErr: string): Promise<void> => {
    const combined = `${rawOut || ''}\n${rawErr || ''}`
    const missingImportRegex = /Failed to resolve import ["']([^"']+)["'] from ["']([^"']+)["']/g
    const repairs: Array<{ missing: string; issuer: string; created: string }> = []

    const resolveRelative = (issuerPath: string, importPath: string): string => {
      const issuerParts = issuerPath.split('/').slice(0, -1)
      const importParts = importPath.split('/')
      const stack: string[] = [...issuerParts]
      for (const part of importParts) {
        if (part === '.' || part === '') continue
        if (part === '..') {
          if (stack.length > 0) stack.pop()
        } else {
          stack.push(part)
        }
      }
      return stack.join('/')
    }

    let match: RegExpExecArray | null
    while ((match = missingImportRegex.exec(combined)) !== null) {
      const missing = match[1]
      const issuer = match[2]
      if (!missing.startsWith('.')) continue

      const absoluteTarget = resolveRelative(issuer, missing)
      const appRoot = '/home/user/app/'
      const relFromRoot = absoluteTarget.startsWith(appRoot)
        ? absoluteTarget.slice(appRoot.length)
        : absoluteTarget.replace(/^\/?/, '')

      const rootConfigFiles = new Set([
        'tailwind.config.js',
        'vite.config.js',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'postcss.config.js',
      ])
      let normalized = relFromRoot
      if (
        !normalized.startsWith('src/') &&
        !normalized.startsWith('public/') &&
        normalized !== 'index.html' &&
        !rootConfigFiles.has((normalized.split('/').pop() || '').trim())
      ) {
        normalized = `src/${normalized}`
      }

      console.log(
        `[applyAiCodeStream] Skipping placeholder creation for missing import: ${missing} from ${issuer}`
      )
      continue
    }

    if (repairs.length > 0) {
      await onProgress({
        type: 'warning',
        message: `Auto-repaired ${repairs.length} missing imports`,
      })
      const rebuild = await provider.runCommand('npm run build')
      const out = rebuild.stdout || ''
      const err = rebuild.stderr || ''
      if (rebuild.stdout)
        await onProgress({
          type: 'command-output',
          command: 'build',
          output: out,
          stream: 'stdout',
        })
      if (rebuild.stderr)
        await onProgress({
          type: 'command-output',
          command: 'build',
          output: err,
          stream: 'stderr',
        })
      if (rebuild.exitCode !== 0) {
        await tryAutoRepairAndRebuild(out, err)
      }
    }
  }

  try {
    const diag = await provider.runCommand('npx --yes vite build')
    await tryAutoRepairAndRebuild(diag.stdout || '', diag.stderr || '')
  } catch {}

  if (isEdit && editContext && global.conversationState) {
    const editRecord: ConversationEdit = {
      timestamp: Date.now(),
      userRequest: prompt,
      editType: editContext.editIntent.type,
      targetFiles: editContext.primaryFiles,
      confidence: editContext.editIntent.confidence,
      outcome: 'success',
    }

    global.conversationState.context.edits.push(editRecord)

    if (editContext.editIntent.type === EditType.ADD_FEATURE || filteredFiles.length > 3) {
      global.conversationState.context.projectEvolution.majorChanges.push({
        timestamp: Date.now(),
        description: editContext.editIntent.description,
        filesAffected: editContext.primaryFiles,
      })
    }

    global.conversationState.lastUpdated = Date.now()
  }

  await onProgress({
    type: 'complete',
    results,
    explanation: fullParsed.explanation,
    structure: fullParsed.structure,
    message: `Successfully applied ${results.filesCreated.length} files`,
  })

  const hasSuccessfulOperations =
    results.filesCreated.length > 0 ||
    results.filesUpdated.length > 0 ||
    results.packagesInstalled.length > 0
  const criticalErrors = results.errors.filter(
    (error) =>
      !error.includes('Package installation failed') &&
      !error.includes('Failed to execute') &&
      !error.includes('timeout')
  )

  const finalSuccess = hasSuccessfulOperations || criticalErrors.length === 0

  console.log(`[applyAiCodeStream] Completion summary:`, {
    filesCreated: results.filesCreated.length,
    filesUpdated: results.filesUpdated.length,
    packagesInstalled: results.packagesInstalled.length,
    totalErrors: results.errors.length,
    criticalErrors: criticalErrors.length,
    hasSuccessfulOperations,
    finalSuccess,
  })

  if (projectId && userId) {
    const assistantMessage = `Generated ${results.filesCreated.length} files: ${results.filesCreated.join(', ')}${results.errors.length > 0 ? `. Warnings: ${results.errors.join(', ')}` : ''}`
    await saveChatMessage(projectId, userId, 'assistant', assistantMessage)
  }

  return {
    success: finalSuccess,
    results,
    explanation: fullParsed.explanation,
    structure: fullParsed.structure,
    parsedFiles: fullParsed.files,
    message: `Applied ${results.filesCreated.length} files${results.errors.length > 0 ? ' with warnings' : ''}`,
    thinkingAnalysis: thinkingAnalysis || undefined,
  }
}
