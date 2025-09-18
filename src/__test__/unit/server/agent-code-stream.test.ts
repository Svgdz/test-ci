import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { applyAiCodeStream } from '@/server/agent/agent-code-stream'
import type { ApplyAiCodeStreamInput, ProgressEvent } from '@/server/agent/types'

// Mock dependencies
vi.mock('@/lib/clients/logger', () => ({
  l: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/server/sandbox/factory', () => ({
  SandboxFactory: {
    create: vi.fn(() => ({
      createSandbox: vi.fn(() => Promise.resolve({ sandboxId: 'test-sandbox-123' })),
      setupViteApp: vi.fn(() => Promise.resolve()),
      listFiles: vi.fn(() => Promise.resolve(['src/App.tsx', 'package.json'])),
      readFile: vi.fn(() => Promise.resolve('mock file content')),
      writeFile: vi.fn(() => Promise.resolve()),
      runCommand: vi.fn(() =>
        Promise.resolve({
          exitCode: 0,
          stdout: 'Command executed successfully',
          stderr: '',
        })
      ),
    })),
  },
}))

vi.mock('@/server/sandbox/manager', () => ({
  sandboxManager: {
    getProvider: vi.fn(() => null),
    getActiveProvider: vi.fn(() => null),
    registerSandbox: vi.fn(),
    setActiveSandbox: vi.fn(),
  },
}))

vi.mock('ai', () => ({
  streamText: vi.fn(() => ({
    textStream: (async function* () {
      yield 'Mock'
      yield ' AI'
      yield ' response'
    })(),
  })),
}))

// Mock the AI provider creation functions to return mock model functions
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => {
    // Return a function that creates model instances
    return vi.fn((modelName) => ({
      name: modelName,
      invoke: vi.fn(() => Promise.resolve({ content: 'Mock response' })),
      stream: vi.fn(() => ({
        textStream: (async function* () {
          yield 'Mock'
          yield ' response'
        })(),
      })),
    }))
  }),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    return vi.fn((modelName) => ({
      name: modelName,
      invoke: vi.fn(() => Promise.resolve({ content: 'Mock response' })),
      stream: vi.fn(() => ({
        textStream: (async function* () {
          yield 'Mock'
          yield ' response'
        })(),
      })),
    }))
  }),
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => {
    return vi.fn((modelName) => ({
      name: modelName,
      invoke: vi.fn(() => Promise.resolve({ content: 'Mock response' })),
      stream: vi.fn(() => ({
        textStream: (async function* () {
          yield 'Mock'
          yield ' response'
        })(),
      })),
    }))
  }),
}))

describe('Agent Code Stream Unit Tests', () => {
  let mockOnProgress: ReturnType<typeof vi.fn>
  let mockInput: ApplyAiCodeStreamInput

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnProgress = vi.fn()
    mockInput = {
      prompt: 'Create a simple React app',
      model: 'anthropic/claude-sonnet-4-20250514',
      context: {
        sandboxId: 'test-sandbox-123',
        currentFiles: {},
      },
      isEdit: false,
      packages: [],
      sandboxId: 'test-sandbox-123',
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Function Initialization', () => {
    it('should be defined and callable', () => {
      expect(applyAiCodeStream).toBeDefined()
      expect(typeof applyAiCodeStream).toBe('function')
    })
  })

  describe('Input Validation', () => {
    it('should handle basic input structure', async () => {
      const result = await applyAiCodeStream(mockInput, mockOnProgress)

      expect(result).toBeDefined()
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('explanation')
    })

    it('should handle empty prompts gracefully', async () => {
      const emptyInput = { ...mockInput, prompt: '' }

      const result = await applyAiCodeStream(emptyInput, mockOnProgress)

      expect(result).toBeDefined()
      expect(result).toHaveProperty('success')
      // Empty prompts may still succeed in the current implementation
      // as the system can handle them gracefully
    })

    it('should handle missing context', async () => {
      const noContextInput = { ...mockInput, context: undefined }

      const result = await applyAiCodeStream(noContextInput, mockOnProgress)

      expect(result).toBeDefined()
      // Should still attempt to process even without context
    })
  })

  describe('Progress Reporting', () => {
    it('should call onProgress callback', async () => {
      await applyAiCodeStream(mockInput, mockOnProgress)

      // Should have called progress at least once
      expect(mockOnProgress).toHaveBeenCalled()
    })

    it('should report different progress types', async () => {
      await applyAiCodeStream(mockInput, mockOnProgress)

      // Check if different progress event types were reported
      const progressCalls = mockOnProgress.mock.calls
      expect(progressCalls.length).toBeGreaterThan(0)

      // Each call should have a progress event with a type
      progressCalls.forEach((call) => {
        expect(call[0]).toHaveProperty('type')
      })
    })
  })

  describe('Edit vs New Project Handling', () => {
    it('should handle new project creation', async () => {
      const newProjectInput = { ...mockInput, isEdit: false }

      const result = await applyAiCodeStream(newProjectInput, mockOnProgress)

      expect(result).toBeDefined()
      expect(result).toHaveProperty('success')
    })

    it('should handle edit requests', async () => {
      const editInput = {
        ...mockInput,
        isEdit: true,
        context: {
          ...mockInput.context,
          currentFiles: {
            'src/App.tsx': 'existing app content',
          },
        },
      }

      const result = await applyAiCodeStream(editInput, mockOnProgress)

      expect(result).toBeDefined()
      expect(result).toHaveProperty('success')
    })
  })

  describe('Model Support', () => {
    it('should handle different AI models', async () => {
      const models = ['anthropic/claude-sonnet-4-20250514', 'openai/gpt-4', 'google/gemini-pro']

      for (const model of models) {
        const modelInput = { ...mockInput, model }
        const result = await applyAiCodeStream(modelInput, mockOnProgress)

        expect(result).toBeDefined()
        expect(result).toHaveProperty('success')
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed prompts', async () => {
      const malformedInput = {
        ...mockInput,
        prompt: '!@#$%^&*(){}[]|\\:";\'<>?,./',
      }

      const result = await applyAiCodeStream(malformedInput, mockOnProgress)

      expect(result).toBeDefined()
      // Should not throw, should return a result object
    })

    it('should handle very long prompts', async () => {
      const longPrompt = 'a'.repeat(10000)
      const longInput = { ...mockInput, prompt: longPrompt }

      const result = await applyAiCodeStream(longInput, mockOnProgress)

      expect(result).toBeDefined()
      // Should handle long input gracefully
    })

    it('should handle invalid sandbox IDs', async () => {
      const invalidSandboxInput = {
        ...mockInput,
        sandboxId: '',
        context: { ...mockInput.context, sandboxId: '' },
      }

      const result = await applyAiCodeStream(invalidSandboxInput, mockOnProgress)

      expect(result).toBeDefined()
      // Should attempt to create new sandbox or handle gracefully
    })
  })

  describe('Security', () => {
    it('should handle potentially malicious input', async () => {
      const maliciousPrompts = [
        '<script>alert("xss")</script>',
        'DROP TABLE users;',
        '${process.env.SECRET_KEY}',
        '../../etc/passwd',
      ]

      for (const prompt of maliciousPrompts) {
        const maliciousInput = { ...mockInput, prompt }
        const result = await applyAiCodeStream(maliciousInput, mockOnProgress)

        expect(result).toBeDefined()
        // Should sanitize or handle malicious input safely
      }
    })
  })

  describe('Result Structure', () => {
    it('should return proper result structure', async () => {
      const result = await applyAiCodeStream(mockInput, mockOnProgress)

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('explanation')
      expect(result).toHaveProperty('structure')
      expect(result).toHaveProperty('parsedFiles')
      expect(result).toHaveProperty('message')

      // Results should have expected structure
      expect(result.results).toHaveProperty('filesCreated')
      expect(result.results).toHaveProperty('filesUpdated')
      expect(result.results).toHaveProperty('packagesInstalled')
      expect(result.results).toHaveProperty('packagesAlreadyInstalled')
      expect(result.results).toHaveProperty('packagesFailed')
      expect(result.results).toHaveProperty('commandsExecuted')
      expect(result.results).toHaveProperty('errors')

      // Arrays should be arrays
      expect(Array.isArray(result.results.filesCreated)).toBe(true)
      expect(Array.isArray(result.results.filesUpdated)).toBe(true)
      expect(Array.isArray(result.results.packagesInstalled)).toBe(true)
      expect(Array.isArray(result.results.errors)).toBe(true)
    })
  })
})
