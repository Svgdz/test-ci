import { Tables, TablesInsert } from '@/types/database.types'

// Test data factories for consistent test data generation

export const createMockUser = (
  overrides: Partial<{ id: string; email: string; name: string }> = {}
) => ({
  id: overrides.id || 'test-user-123',
  email: overrides.email || 'test@example.com',
  user_metadata: {
    full_name: overrides.name || 'Test User',
    avatar_url: 'https://example.com/avatar.jpg',
  },
})

export const createMockSession = (
  userOverrides?: Partial<{ id: string; email: string; name: string }>
) => ({
  user: createMockUser(userOverrides),
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Date.now() + 3600000, // 1 hour from now
  token_type: 'bearer',
})

export const createMockProject = (
  overrides: Partial<Tables<'projects'>> = {}
): Tables<'projects'> => ({
  id: overrides.id || 'project-123',
  name: overrides.name || 'Test Project',
  description: overrides.description || 'A test project for development',
  account_id: overrides.account_id || 'test-user-123',
  sandbox_id: overrides.sandbox_id || 'test-sandbox-123',
  status: overrides.status || 'active',
  visibility: overrides.visibility || 'private',
  watermark: overrides.watermark ?? true,
  created_at: overrides.created_at || new Date().toISOString(),
  updated_at: overrides.updated_at || new Date().toISOString(),
  template: overrides.template || 'react',
  prompt: overrides.prompt || 'Create a simple React application',
})

export const createMockProjectInsert = (
  overrides: Partial<TablesInsert<'projects'>> = {}
): TablesInsert<'projects'> => ({
  name: overrides.name || 'Test Project',
  description: overrides.description || 'A test project for development',
  account_id: overrides.account_id || 'test-user-123',
  sandbox_id: overrides.sandbox_id || 'test-sandbox-123',
  status: overrides.status || 'active',
  visibility: overrides.visibility || 'private',
  watermark: overrides.watermark ?? true,
  template: overrides.template || 'react',
  prompt: overrides.prompt || 'Create a simple React application',
})

export const createMockProjectSecret = (
  overrides: Partial<Tables<'project_secrets'>> = {}
): Tables<'project_secrets'> => ({
  id: overrides.id || 'secret-123',
  project_id: overrides.project_id || 'project-123',
  key: overrides.key || 'API_KEY',
  created_at: overrides.created_at || new Date().toISOString(),
  updated_at: overrides.updated_at || new Date().toISOString(),
})

export const createMockChatMessage = (
  overrides: Partial<{
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp?: string
  }> = {}
) => ({
  id: overrides.id || `msg-${Date.now()}`,
  role: overrides.role || 'user',
  content: overrides.content || 'Test message content',
  timestamp: overrides.timestamp || new Date().toISOString(),
})

export const createMockSandboxFile = (
  overrides: Partial<{
    path: string
    content: string
    type: 'file' | 'directory'
    size?: number
  }> = {}
) => ({
  path: overrides.path || '/home/user/index.js',
  content: overrides.content || 'console.log("Hello World")',
  type: overrides.type || ('file' as const),
  size: overrides.size || overrides.content?.length || 0,
})

export const createMockSandboxConnection = (
  overrides: Partial<{
    sandboxId: string
    isReady: boolean
    error: string | null
  }> = {}
) => ({
  sandboxId: overrides.sandboxId || 'test-sandbox-123',
  isReady: overrides.isReady ?? true,
  error: overrides.error || null,
  filesystem: {
    read: vi.fn(() => Promise.resolve('file content')),
    write: vi.fn(() => Promise.resolve()),
    list: vi.fn(() =>
      Promise.resolve([
        createMockSandboxFile({ path: '/home/user/package.json', content: '{"name": "test"}' }),
        createMockSandboxFile({ path: '/home/user/src/index.js' }),
      ])
    ),
    delete: vi.fn(() => Promise.resolve()),
  },
  process: {
    start: vi.fn(() =>
      Promise.resolve({
        stdout: 'Command executed successfully',
        stderr: '',
        exitCode: 0,
      })
    ),
  },
})

export const createMockApiResponse = <T>(data: T, success = true) => ({
  data: success ? data : undefined,
  error: success ? null : 'Mock API error',
  success,
})

export const createMockFormData = (fields: Record<string, string>) => {
  const formData = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value)
  })
  return formData
}

// Common test scenarios
export const testScenarios = {
  auth: {
    validCredentials: {
      email: 'user@example.com',
      password: 'SecurePassword123!',
    },
    invalidCredentials: {
      email: 'invalid@example.com',
      password: 'wrongpassword',
    },
    malformedEmail: {
      email: 'not-an-email',
      password: 'password123',
    },
    weakPassword: {
      email: 'user@example.com',
      password: '123',
    },
  },

  projects: {
    validProject: {
      name: 'My Awesome App',
      description: 'A great application built with AI',
      template: 'react',
      visibility: 'private' as const,
    },
    emptyProject: {
      name: '',
      description: '',
      template: 'react',
      visibility: 'private' as const,
    },
    longProject: {
      name: 'A'.repeat(300), // Very long name
      description: 'B'.repeat(1000), // Very long description
      template: 'react',
      visibility: 'private' as const,
    },
  },

  chat: {
    simplePrompt: 'Create a hello world app',
    complexPrompt:
      'Create a full-stack web application with user authentication, database integration, and a modern UI',
    emptyPrompt: '',
    maliciousPrompt: '<script>alert("xss")</script>',
    longPrompt: 'C'.repeat(10000),
  },

  sandbox: {
    validSandboxId: 'sb_1234567890abcdef',
    invalidSandboxId: 'invalid-sandbox',
    emptySandboxId: '',
  },
}

// Error scenarios for testing error handling
export const errorScenarios = {
  database: {
    connectionError: {
      code: 'CONNECTION_ERROR',
      message: 'Failed to connect to database',
    },
    constraintViolation: {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    },
    notFound: {
      code: 'PGRST116',
      message: 'The result contains 0 rows',
    },
  },

  api: {
    rateLimitError: {
      status: 429,
      message: 'Too many requests',
    },
    serverError: {
      status: 500,
      message: 'Internal server error',
    },
    unauthorizedError: {
      status: 401,
      message: 'Unauthorized',
    },
    forbiddenError: {
      status: 403,
      message: 'Forbidden',
    },
  },

  sandbox: {
    connectionTimeout: 'Sandbox connection timeout',
    permissionDenied: 'Permission denied',
    sandboxNotFound: 'Sandbox not found',
    fileSystemError: 'File system operation failed',
  },
}

// Utility functions for test setup
export const mockSupabaseClient = () => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(),
        order: vi.fn(() => ({ single: vi.fn() })),
      })),
      order: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn() })),
      })),
      single: vi.fn(),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(),
    })),
  })),
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    signInWithOAuth: vi.fn(),
  },
})

// Helper to wait for async operations in tests
export const waitForAsync = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

// Helper to create mock environment variables
export const mockEnvVars = (vars: Record<string, string>) => {
  const originalEnv = process.env
  process.env = { ...originalEnv, ...vars }
  return () => {
    process.env = originalEnv
  }
}
