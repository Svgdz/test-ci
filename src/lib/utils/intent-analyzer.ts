import { FileManifest, EditType, EditIntent, IntentPattern } from '@/types/file-manifest'

/**
 * Extract component names from prompt
 */
function extractComponentNames(prompt: string): string[] {
  const words = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)

  // Filter out common words
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'this',
    'that',
    'from',
    'add',
    'new',
    'create',
    'update',
    'change',
    'modify',
    'fix',
    'remove',
    'delete',
    'component',
    'section',
    'page',
    'feature',
  ])
  return words.filter((word) => !stopWords.has(word))
}

/**
 * Find component files mentioned in the prompt
 */
function findComponentFiles(prompt: string, manifest: FileManifest): string[] {
  const files: string[] = []
  const lowerPrompt = prompt.toLowerCase()

  // Extract component names from prompt
  const componentWords = extractComponentNames(prompt)
  console.log('[findComponentFiles] Extracted words:', componentWords)

  // First pass: Look for exact component file matches
  for (const [path] of Object.entries(manifest.files)) {
    // Check if file name or component name matches
    const fileName = path.split('/').pop()?.toLowerCase() || ''
    const fileInfo = manifest.files[path]
    const componentName = fileInfo.componentInfo?.name.toLowerCase()

    for (const word of componentWords) {
      if (fileName.includes(word) || componentName?.includes(word)) {
        console.log(`[findComponentFiles] Match found: word="${word}" in file="${path}"`)
        files.push(path)
        break // Stop after first match to avoid duplicates
      }
    }
  }

  // If no specific component found, check for common UI elements
  if (files.length === 0) {
    const uiElements = [
      'header',
      'footer',
      'nav',
      'sidebar',
      'button',
      'card',
      'modal',
      'hero',
      'banner',
      'about',
      'services',
      'features',
      'testimonials',
      'gallery',
      'contact',
      'team',
      'pricing',
    ]

    for (const element of uiElements) {
      if (lowerPrompt.includes(element)) {
        // Look for exact component file matches first
        for (const [path] of Object.entries(manifest.files)) {
          const fileName = path.split('/').pop()?.toLowerCase() || ''
          // Only match if the filename contains the element name
          if (fileName.includes(element + '.') || fileName === element) {
            files.push(path)
            console.log(
              `[findComponentFiles] UI element match: element="${element}" in file="${path}"`
            )
            return files // Return immediately with just this file
          }
        }

        // If no exact file match, look for the element in file names (but be more selective)
        for (const [path] of Object.entries(manifest.files)) {
          const fileName = path.split('/').pop()?.toLowerCase() || ''
          if (fileName.includes(element)) {
            files.push(path)
            console.log(
              `[findComponentFiles] UI element partial match: element="${element}" in file="${path}"`
            )
            return files // Return immediately with just this file
          }
        }
      }
    }
  }

  // Limit results to most specific matches
  if (files.length > 1) {
    console.log(
      `[findComponentFiles] Multiple files found (${files.length}), limiting to first match`
    )
    return [files[0]] // Only return the first match
  }

  return files.length > 0 ? files : [manifest.entryPoint]
}

/**
 * Find component files mentioned in the prompt
 */
function findComponentByContent(prompt: string, manifest: FileManifest): string[] {
  return findComponentFiles(prompt, manifest)
}

/**
 * Find where to add new features
 */
function findFeatureInsertionPoints(prompt: string, manifest: FileManifest): string[] {
  const files: string[] = []
  const lowerPrompt = prompt.toLowerCase()

  // For new pages, we need routing files and layout
  if (lowerPrompt.includes('page')) {
    // Find router configuration
    for (const [path, fileInfo] of Object.entries(manifest.files)) {
      if (
        fileInfo.content.includes('Route') ||
        fileInfo.content.includes('createBrowserRouter') ||
        path.includes('router') ||
        path.includes('routes')
      ) {
        files.push(path)
        break
      }
    }
  }

  // For components, find the main app or layout file
  if (lowerPrompt.includes('component') || lowerPrompt.includes('section')) {
    files.push(manifest.entryPoint)
  }

  return files.length > 0 ? files : [manifest.entryPoint]
}

/**
 * Find files that might have problems
 */
function findProblemFiles(prompt: string, manifest: FileManifest): string[] {
  const files: string[] = []
  const componentWords = extractComponentNames(prompt)

  // Look for files mentioned in the prompt
  for (const [path, fileInfo] of Object.entries(manifest.files)) {
    const fileName = path.split('/').pop()?.toLowerCase() || ''

    for (const word of componentWords) {
      if (fileName.includes(word) || fileInfo.content.toLowerCase().includes(word)) {
        files.push(path)
        break
      }
    }
  }

  return files.length > 0 ? files : [manifest.entryPoint]
}

/**
 * Find style-related files
 */
function findStyleFiles(prompt: string, manifest: FileManifest): string[] {
  const files: string[] = []

  // Look for CSS/style files
  for (const [path, fileInfo] of Object.entries(manifest.files)) {
    if (
      path.endsWith('.css') ||
      path.endsWith('.scss') ||
      path.endsWith('.sass') ||
      fileInfo.content.includes('styled') ||
      fileInfo.content.includes('className')
    ) {
      files.push(path)
    }
  }

  return files.length > 0 ? files : [manifest.entryPoint]
}

/**
 * Find files to refactor
 */
function findRefactorTargets(prompt: string, manifest: FileManifest): string[] {
  return findComponentFiles(prompt, manifest)
}

/**
 * Find package-related files
 */
function findPackageFiles(prompt: string, manifest: FileManifest): string[] {
  const files: string[] = []

  // Look for package.json and related files
  for (const [path] of Object.entries(manifest.files)) {
    if (
      path.includes('package.json') ||
      path.includes('yarn.lock') ||
      path.includes('package-lock.json')
    ) {
      files.push(path)
    }
  }

  return files.length > 0 ? files : [manifest.entryPoint]
}

/**
 * Get suggested context files
 */
function getSuggestedContext(targetFiles: string[], manifest: FileManifest): string[] {
  const context: string[] = []

  // Add related files based on imports
  for (const targetFile of targetFiles) {
    const fileInfo = manifest.files[targetFile]
    if (fileInfo?.imports) {
      for (const importInfo of fileInfo.imports) {
        const importPath = typeof importInfo === 'string' ? importInfo : importInfo.source
        if (manifest.files[importPath]) {
          context.push(importPath)
        }
      }
    }
  }

  return [...new Set(context)] // Remove duplicates
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  prompt: string,
  pattern: IntentPattern,
  targetFiles: string[]
): number {
  let confidence = 0.5 // Base confidence

  // Higher confidence if we found specific files
  if (targetFiles.length > 0 && targetFiles[0] !== '') {
    confidence += 0.2
  }

  // Higher confidence for more specific prompts
  if (prompt.split(' ').length > 5) {
    confidence += 0.1
  }

  // Higher confidence for exact pattern matches
  for (const regex of pattern.patterns) {
    if (regex.test(prompt)) {
      confidence += 0.2
      break
    }
  }

  return Math.min(confidence, 1.0)
}

/**
 * Generate human-readable description
 */
function generateDescription(type: EditType, prompt: string, targetFiles: string[]): string {
  const fileNames = targetFiles.map((f) => f.split('/').pop()).join(', ')

  switch (type) {
    case EditType.UPDATE_COMPONENT:
      return `Updating component(s): ${fileNames}`
    case EditType.ADD_FEATURE:
      return `Adding new feature to: ${fileNames}`
    case EditType.FIX_ISSUE:
      return `Fixing issue in: ${fileNames}`
    case EditType.UPDATE_STYLE:
      return `Updating styles in: ${fileNames}`
    case EditType.REFACTOR:
      return `Refactoring: ${fileNames}`
    case EditType.ADD_DEPENDENCY:
      return `Adding package dependencies`
    default:
      return `Editing: ${fileNames}`
  }
}

/**
 * Analyze user prompts to determine edit intent and select relevant files
 */
export function analyzeEditIntent(prompt: string, manifest: FileManifest): EditIntent {
  // Define intent patterns
  const patterns: IntentPattern[] = [
    {
      patterns: [
        /update\s+(the\s+)?(\w+)\s+(component|section|page)/i,
        /change\s+(the\s+)?(\w+)/i,
        /modify\s+(the\s+)?(\w+)/i,
        /edit\s+(the\s+)?(\w+)/i,
        /fix\s+(the\s+)?(\w+)\s+(styling|style|css|layout)/i,
        /remove\s+.*\s+(button|link|text|element|section)/i,
        /delete\s+.*\s+(button|link|text|element|section)/i,
        /hide\s+.*\s+(button|link|text|element|section)/i,
      ],
      type: EditType.UPDATE_COMPONENT,
      fileResolver: (p, m) => findComponentByContent(p, m),
    },
    {
      patterns: [
        /add\s+(a\s+)?new\s+(\w+)\s+(page|section|feature|component)/i,
        /create\s+(a\s+)?(\w+)\s+(page|section|feature|component)/i,
        /implement\s+(a\s+)?(\w+)\s+(page|section|feature)/i,
        /build\s+(a\s+)?(\w+)\s+(page|section|feature)/i,
        /add\s+(\w+)\s+to\s+(?:the\s+)?(\w+)/i,
        /add\s+(?:a\s+)?(\w+)\s+(?:component|section)/i,
        /include\s+(?:a\s+)?(\w+)/i,
      ],
      type: EditType.ADD_FEATURE,
      fileResolver: (p, m) => findFeatureInsertionPoints(p, m),
    },
    {
      patterns: [
        /fix\s+(the\s+)?(\w+|\w+\s+\w+)(?!\s+styling|\s+style)/i,
        /resolve\s+(the\s+)?error/i,
        /debug\s+(the\s+)?(\w+)/i,
        /repair\s+(the\s+)?(\w+)/i,
      ],
      type: EditType.FIX_ISSUE,
      fileResolver: (p, m) => findProblemFiles(p, m),
    },
    {
      patterns: [
        /change\s+(the\s+)?(color|theme|style|styling|css)/i,
        /update\s+(the\s+)?(color|theme|style|styling|css)/i,
        /make\s+it\s+(dark|light|blue|red|green)/i,
        /style\s+(the\s+)?(\w+)/i,
      ],
      type: EditType.UPDATE_STYLE,
      fileResolver: (p, m) => findStyleFiles(p, m),
    },
    {
      patterns: [
        /refactor\s+(the\s+)?(\w+)/i,
        /clean\s+up\s+(the\s+)?code/i,
        /reorganize\s+(the\s+)?(\w+)/i,
        /optimize\s+(the\s+)?(\w+)/i,
      ],
      type: EditType.REFACTOR,
      fileResolver: (p, m) => findRefactorTargets(p, m),
    },
    {
      patterns: [
        /start\s+over/i,
        /recreate\s+everything/i,
        /rebuild\s+(the\s+)?app/i,
        /new\s+app/i,
        /from\s+scratch/i,
        /create\s+(a\s+)?(\w+\s+)?(landing\s+page|website|app|application|page)/i,
        /build\s+(a\s+)?(\w+\s+)?(landing\s+page|website|app|application|page)/i,
        /make\s+(a\s+)?(\w+\s+)?(landing\s+page|website|app|application|page)/i,
      ],
      type: EditType.FULL_REBUILD,
      fileResolver: (p, m) => [m.entryPoint],
    },
    {
      patterns: [
        /install\s+(\w+)/i,
        /add\s+(\w+)\s+(package|library|dependency)/i,
        /use\s+(\w+)\s+(library|framework)/i,
      ],
      type: EditType.ADD_DEPENDENCY,
      fileResolver: (p, m) => findPackageFiles(p, m),
    },
  ]

  // Find matching pattern
  for (const pattern of patterns) {
    for (const regex of pattern.patterns) {
      if (regex.test(prompt)) {
        const targetFiles = pattern.fileResolver(prompt, manifest)
        const suggestedContext = getSuggestedContext(targetFiles, manifest)

        return {
          type: pattern.type,
          targetFiles,
          confidence: calculateConfidence(prompt, pattern, targetFiles),
          description: generateDescription(pattern.type, prompt, targetFiles),
          suggestedContext,
        }
      }
    }
  }

  // Default to component update if no pattern matches
  return {
    type: EditType.UPDATE_COMPONENT,
    targetFiles: [manifest.entryPoint],
    confidence: 0.3,
    description: 'General update to application',
    suggestedContext: [],
  }
}
