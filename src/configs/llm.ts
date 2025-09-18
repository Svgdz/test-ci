export const llmConfig = {
  // Default AI model
  defaultModel: 'anthropic/claude-sonnet-4-20250514',

  // Available models
  availableModels: [
    'openai/gpt-5',
    'anthropic/claude-sonnet-4-20250514',
    'google/gemini-2.0-flash-exp',
  ],

  // Model display names
  modelDisplayNames: {
    'openai/gpt-5': 'GPT-5',
    'anthropic/claude-sonnet-4-20250514': 'Sonnet 4',
    'google/gemini-2.0-flash-exp': 'Gemini 2.0 Flash (Experimental)',
  } as Record<string, string>,

  // Model API configuration
  modelApiConfig: {
    'anthropic/claude-sonnet-4-20250514': {
      provider: 'anthropic',
      model: 'anthropic/claude-sonnet-4-20250514',
    },
  },

  // Package Installation Configuration
  packagesConfig: {
    // Use --legacy-peer-deps flag for npm install
    useLegacyPeerDeps: true,

    // Package installation timeout (milliseconds)
    installTimeout: 60000,

    // Auto-restart Vite after package installation
    autoRestartVite: true,
  },

  // Temperature settings for non-reasoning models
  defaultTemperature: 0.7,

  // Max tokens for code generation
  maxTokens: 8000,

  // Max tokens for truncation recovery
  truncationRecoveryMaxTokens: 4000,
}

export default llmConfig
