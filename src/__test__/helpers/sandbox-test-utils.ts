import { vi } from 'vitest'
import type { SandboxProvider, SandboxInfo, CommandResult } from '@/server/sandbox/types'

/**
 * Test utilities for sandbox operations
 *
 * This file provides helper functions and utilities for testing sandbox
 * functionality without relying on mocks that can create false positives.
 */

export interface TestSandboxConfig {
  useRealE2B?: boolean
  timeoutMs?: number
  maxRetries?: number
}

export class SandboxTestHelper {
  private static instance: SandboxTestHelper
  private config: TestSandboxConfig

  private constructor(config: TestSandboxConfig = {}) {
    this.config = {
      useRealE2B: false,
      timeoutMs: 30000,
      maxRetries: 3,
      ...config,
    }
  }

  static getInstance(config?: TestSandboxConfig): SandboxTestHelper {
    if (!SandboxTestHelper.instance) {
      SandboxTestHelper.instance = new SandboxTestHelper(config)
    }
    return SandboxTestHelper.instance
  }

  /**
   * Determines if real E2B should be used based on environment
   */
  shouldUseRealE2B(): boolean {
    if (this.config.useRealE2B === false) return false

    const hasApiKey = !!process.env.E2B_API_KEY && process.env.E2B_API_KEY.trim() !== ''
    const isNotTestEnv = process.env.NODE_ENV !== 'test'
    const isIntegrationTest = process.env.TEST_TYPE === 'integration'

    return hasApiKey && (isNotTestEnv || isIntegrationTest)
  }

  /**
   * Creates a provider for testing (real or test implementation)
   */
  async createTestProvider(): Promise<SandboxProvider> {
    if (this.shouldUseRealE2B()) {
      const { SandboxFactory } = await import('@/server/sandbox/factory')
      return SandboxFactory.create('e2b')
    } else {
      const { TestSandboxProvider } = await import('./test-sandbox-provider')
      return new TestSandboxProvider()
    }
  }

  /**
   * Validates that a sandbox info object has the required structure
   */
  validateSandboxInfo(info: unknown): info is SandboxInfo {
    if (!info || typeof info !== 'object') return false

    const si = info as Record<string, unknown>
    return !!(
      typeof si.sandboxId === 'string' &&
      si.sandboxId.trim() &&
      typeof si.url === 'string' &&
      si.url.trim() &&
      typeof si.provider === 'string' &&
      si.provider.trim() &&
      si.createdAt instanceof Date
    )
  }

  /**
   * Validates that a command result has the required structure
   */
  validateCommandResult(result: unknown): result is CommandResult {
    if (!result || typeof result !== 'object') return false

    const cr = result as Record<string, unknown>
    return !!(
      typeof cr.success === 'boolean' &&
      typeof cr.stdout === 'string' &&
      typeof cr.stderr === 'string' &&
      typeof cr.exitCode === 'number'
    )
  }

  /**
   * Waits for a condition to be true with timeout and retries
   */
  async waitForCondition(
    condition: () => Promise<boolean> | boolean,
    timeoutMs = this.config.timeoutMs!,
    intervalMs = 100
  ): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      try {
        const result = await condition()
        if (result) return true
      } catch {
        // Ignore errors and continue polling
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    return false
  }

  /**
   * Retries an operation with exponential backoff
   */
  async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries = this.config.maxRetries!,
    baseDelayMs = 100
  ): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt === maxRetries) break

        const delay = baseDelayMs * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw lastError || new Error('Operation failed after retries')
  }

  /**
   * Creates a temporary test file with cleanup
   */
  createTempFile(provider: SandboxProvider, path: string, content: string) {
    const cleanup = async () => {
      try {
        // Try to remove the file (not all providers may support this)
        if ('removeFile' in provider && typeof provider.removeFile === 'function') {
          await (provider as { removeFile: (path: string) => Promise<void> }).removeFile(path)
        }
      } catch {
        // Ignore cleanup errors
      }
    }

    return {
      write: () => provider.writeFile(path, content),
      cleanup,
    }
  }

  /**
   * Measures execution time of an operation
   */
  async measureExecutionTime<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; durationMs: number }> {
    const startTime = Date.now()
    const result = await operation()
    const durationMs = Date.now() - startTime

    return { result, durationMs }
  }

  /**
   * Generates test data for various scenarios
   */
  generateTestData() {
    return {
      validPaths: [
        '/home/user/src/App.tsx',
        '/home/user/package.json',
        '/home/user/src/components/Button.tsx',
        '/home/user/styles/main.css',
      ],
      invalidPaths: ['/etc/passwd', '../../../etc/passwd', '/root/secret.txt', ''],
      safeCommands: ['npm install', 'npm run build', 'npm test', 'ls -la', 'cat package.json'],
      dangerousCommands: [
        'rm -rf /',
        'sudo rm -rf /',
        'curl http://malicious.com',
        'ssh user@server',
      ],
      fileContents: {
        simpleText: 'Hello, World!',
        jsonData: JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2),
        reactComponent: `import React from 'react'

export const TestComponent: React.FC = () => {
  return <div>Test Component</div>
}

export default TestComponent`,
        largeContent: 'A'.repeat(100000),
        specialChars:
          'Unicode: 🚀 🎉 ✨\nSymbols: !@#$%^&*()\nQuotes: "double" \'single\' \`backtick\`',
      },
    }
  }
}

/**
 * Test environment setup and teardown utilities
 */
export class TestEnvironment {
  private originalEnv: Record<string, string | undefined> = {}
  private cleanupTasks: Array<() => Promise<void> | void> = []

  /**
   * Sets up test environment with specific configuration
   */
  setup(config: {
    E2B_API_KEY?: string
    SANDBOX_PROVIDER?: string
    NODE_ENV?: string
    TEST_TYPE?: string
  }) {
    // Backup original environment
    Object.keys(config).forEach((key) => {
      this.originalEnv[key] = process.env[key]
      if (config[key as keyof typeof config] !== undefined) {
        process.env[key] = config[key as keyof typeof config]
      } else {
        delete process.env[key]
      }
    })
  }

  /**
   * Adds a cleanup task to be executed during teardown
   */
  addCleanupTask(task: () => Promise<void> | void) {
    this.cleanupTasks.push(task)
  }

  /**
   * Tears down test environment and runs cleanup tasks
   */
  async teardown() {
    // Run cleanup tasks
    for (const task of this.cleanupTasks) {
      try {
        await task()
      } catch (error) {
        console.warn('Cleanup task failed:', error)
      }
    }
    this.cleanupTasks = []

    // Restore original environment
    Object.keys(this.originalEnv).forEach((key) => {
      if (this.originalEnv[key] !== undefined) {
        process.env[key] = this.originalEnv[key]
      } else {
        delete process.env[key]
      }
    })
    this.originalEnv = {}
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTestUtils {
  /**
   * Tests concurrent operations and measures performance
   */
  static async testConcurrentOperations<T>(
    operations: Array<() => Promise<T>>,
    expectedMaxDurationMs: number
  ): Promise<{ results: T[]; durationMs: number; passed: boolean }> {
    const startTime = Date.now()
    const results = await Promise.all(operations.map((op) => op()))
    const durationMs = Date.now() - startTime

    return {
      results,
      durationMs,
      passed: durationMs <= expectedMaxDurationMs,
    }
  }

  /**
   * Tests sequential operations and measures performance
   */
  static async testSequentialOperations<T>(
    operations: Array<() => Promise<T>>,
    expectedMaxDurationMs: number
  ): Promise<{ results: T[]; durationMs: number; passed: boolean }> {
    const startTime = Date.now()
    const results: T[] = []

    for (const operation of operations) {
      results.push(await operation())
    }

    const durationMs = Date.now() - startTime

    return {
      results,
      durationMs,
      passed: durationMs <= expectedMaxDurationMs,
    }
  }

  /**
   * Measures memory usage during operation (Node.js only)
   */
  static async measureMemoryUsage<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; memoryUsage: NodeJS.MemoryUsage }> {
    const initialMemory = process.memoryUsage()
    const result = await operation()
    const finalMemory = process.memoryUsage()

    const memoryUsage = {
      rss: finalMemory.rss - initialMemory.rss,
      heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
      heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
      external: finalMemory.external - initialMemory.external,
      arrayBuffers: finalMemory.arrayBuffers - initialMemory.arrayBuffers,
    }

    return { result, memoryUsage }
  }
}

/**
 * Security testing utilities
 */
export class SecurityTestUtils {
  /**
   * Tests path traversal vulnerabilities
   */
  static getPathTraversalTests(): string[] {
    return [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '/etc/passwd',
      '/root/.ssh/id_rsa',
      'C:\\Windows\\System32\\config\\SAM',
      '../../../../proc/version',
      '/proc/self/environ',
    ]
  }

  /**
   * Tests command injection vulnerabilities
   */
  static getCommandInjectionTests(): string[] {
    return [
      'ls; rm -rf /',
      'ls && rm -rf /',
      'ls | rm -rf /',
      'ls `rm -rf /`',
      'ls $(rm -rf /)',
      'npm install; curl http://malicious.com',
      'echo "test" > /etc/passwd',
    ]
  }

  /**
   * Validates that a path is safe for sandbox operations
   */
  static isPathSafe(path: string): boolean {
    const normalizedPath = path.replace(/[/\\]+/g, '/').replace(/\/\.\.\//g, '/')

    // Must be within sandbox directory
    if (!normalizedPath.startsWith('/home/user/')) return false

    // No path traversal
    if (normalizedPath.includes('/../')) return false

    // No access to system directories
    const forbiddenPaths = ['/etc/', '/root/', '/proc/', '/sys/', '/dev/']
    if (forbiddenPaths.some((forbidden) => normalizedPath.includes(forbidden))) return false

    return true
  }

  /**
   * Validates that a command is safe for sandbox execution
   */
  static isCommandSafe(command: string): boolean {
    const dangerousPatterns = [
      /rm\s+-rf\s+\/[^\/]/,
      /sudo/,
      /curl\s+http/,
      /wget\s+http/,
      /ssh\s+/,
      /scp\s+/,
      /nc\s+/,
      /netcat/,
      /;/,
      /&&/,
      /\|/,
      /`/,
      /\$\(/,
    ]

    return !dangerousPatterns.some((pattern) => pattern.test(command))
  }
}

// Export singleton instance
export const sandboxTestHelper = SandboxTestHelper.getInstance()
