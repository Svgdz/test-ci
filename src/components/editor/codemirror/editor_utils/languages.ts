import { LanguageDescription } from '@codemirror/language'

export const supportedLanguages = [
  LanguageDescription.of({
    name: 'TS',
    extensions: ['ts'],
    async load() {
      return import('@codemirror/lang-javascript').then((module) =>
        module.javascript({ typescript: true })
      )
    },
  }),
  LanguageDescription.of({
    name: 'JS',
    extensions: ['js', 'mjs', 'cjs'],
    async load() {
      return import('@codemirror/lang-javascript').then((module) => module.javascript())
    },
  }),
  LanguageDescription.of({
    name: 'TSX',
    extensions: ['tsx'],
    async load() {
      return import('@codemirror/lang-javascript').then((module) =>
        module.javascript({ jsx: true, typescript: true })
      )
    },
  }),
  LanguageDescription.of({
    name: 'JSX',
    extensions: ['jsx'],
    async load() {
      return import('@codemirror/lang-javascript').then((module) =>
        module.javascript({ jsx: true })
      )
    },
  }),
  LanguageDescription.of({
    name: 'HTML',
    extensions: ['html'],
    async load() {
      return import('@codemirror/lang-html').then((module) => module.html())
    },
  }),
  LanguageDescription.of({
    name: 'CSS',
    extensions: ['css'],
    async load() {
      return import('@codemirror/lang-css').then((module) => module.css())
    },
  }),
  LanguageDescription.of({
    name: 'SASS',
    extensions: ['sass'],
    async load() {
      return import('@codemirror/lang-sass').then((module) => module.sass({ indented: true }))
    },
  }),
  LanguageDescription.of({
    name: 'SCSS',
    extensions: ['scss'],
    async load() {
      return import('@codemirror/lang-sass').then((module) => module.sass({ indented: false }))
    },
  }),
  LanguageDescription.of({
    name: 'JSON',
    extensions: ['json'],
    async load() {
      return import('@codemirror/lang-json').then((module) => module.json())
    },
  }),
  LanguageDescription.of({
    name: 'Markdown',
    extensions: ['md'],
    async load() {
      return import('@codemirror/lang-markdown').then((module) => module.markdown())
    },
  }),
  LanguageDescription.of({
    name: 'Wasm',
    extensions: ['wat'],
    async load() {
      return import('@codemirror/lang-wast').then((module) => module.wast())
    },
  }),
  LanguageDescription.of({
    name: 'Python',
    extensions: ['py'],
    async load() {
      return import('@codemirror/lang-python').then((module) => module.python())
    },
  }),
  LanguageDescription.of({
    name: 'C++',
    extensions: ['cpp', 'cc', 'cxx', 'c++', 'h', 'hpp'],
    async load() {
      return import('@codemirror/lang-cpp').then((module) => module.cpp())
    },
  }),
  LanguageDescription.of({
    name: 'C',
    extensions: ['c', 'h'],
    async load() {
      return import('@codemirror/lang-cpp').then((module) => module.cpp())
    },
  }),
]

// Cache for loaded language supports to prevent re-loading
const languageCache = new Map<string, unknown>()

export async function getLanguage(fileName: string) {
  const languageDescription = LanguageDescription.matchFilename(supportedLanguages, fileName)

  if (!languageDescription) {
    return undefined
  }

  // Check cache first
  const cacheKey = languageDescription.name
  if (languageCache.has(cacheKey)) {
    return languageCache.get(cacheKey)
  }

  try {
    // Load and cache the language support
    const languageSupport = await languageDescription.load()
    languageCache.set(cacheKey, languageSupport)
    return languageSupport
  } catch (error) {
    console.error(`Failed to load language support for ${languageDescription.name}:`, error)
    return undefined
  }
}

// Preload common languages to eliminate loading delays
export async function preloadCommonLanguages() {
  const commonExtensions = ['js', 'ts', 'tsx', 'jsx', 'json', 'css', 'html']
  const preloadPromises = commonExtensions.map(
    (ext) => getLanguage(`example.${ext}`).catch(() => {}) // Ignore errors during preload
  )

  await Promise.allSettled(preloadPromises)
}
