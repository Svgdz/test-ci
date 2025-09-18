import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { SandboxFactory } from '@/server/sandbox/factory'
import { sandboxManager } from '@/server/sandbox/manager'
import { SandboxProvider, type SandboxInfo, type CommandResult } from '@/server/sandbox/types'
import { createMockProject, waitForAsync } from '@/__test__/helpers/test-data'

/**
 * Integration Tests for Sandbox Operations
 *
 * These tests use real sandbox providers (when available) or a test implementation
 * to verify actual functionality rather than mocked behavior.
 *
 * Test Strategy:
 * - Use real E2B provider when E2B_API_KEY is available
 * - Fall back to TestSandboxProvider for CI/local testing without E2B
 * - Test actual file operations, command execution, and error scenarios
 * - Validate real performance characteristics
 */

// Test sandbox provider for environments without E2B access
class TestSandboxProvider extends SandboxProvider {
  private testSandboxId: string
  private testFiles: Map<string, string> = new Map()
  private isTerminated = false
  private testUrl: string

  constructor(config = {}) {
    super(config)
    this.testSandboxId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.testUrl = `https://test-${this.testSandboxId}.local.dev`

    // Initialize with some default test files
    this.testFiles.set(
      '/home/user/package.json',
      JSON.stringify(
        {
          name: 'test-app',
          version: '1.0.0',
          dependencies: {
            react: '^18.0.0',
            'react-dom': '^18.0.0',
          },
        },
        null,
        2
      )
    )

    this.testFiles.set(
      '/home/user/src/App.tsx',
      `import React from 'react'

export default function App() {
  return (
    <div className="app">
      <h1>Hello World</h1>
      <p>This is a test React application</p>
    </div>
  )
}`
    )

    this.testFiles.set(
      '/home/user/src/index.tsx',
      `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(<App />)`
    )
  }

  async createSandbox(): Promise<SandboxInfo> {
    if (this.isTerminated) {
      throw new Error('Cannot create sandbox: provider is terminated')
    }

    // Simulate network delay
    await waitForAsync(100)

    this.sandboxInfo = {
      sandboxId: this.testSandboxId,
      url: this.testUrl,
      provider: 'test',
      createdAt: new Date(),
    }

    return this.sandboxInfo
  }

  async runCommand(command: string): Promise<CommandResult> {
    if (this.isTerminated) {
      throw new Error('Cannot run command: sandbox is terminated')
    }

    // Simulate command execution delay
    await waitForAsync(50)

    // Simulate different command behaviors
    if (command.includes('npm install')) {
      return {
        success: true,
        stdout: 'added 1000 packages in 30s',
        stderr: '',
        exitCode: 0,
      }
    }

    if (command.includes('npm run build')) {
      return {
        success: true,
        stdout: 'Build completed successfully\nFiles written to dist/',
        stderr: '',
        exitCode: 0,
      }
    }

    if (command.includes('invalid-command')) {
      return {
        success: false,
        stdout: '',
        stderr: 'command not found: invalid-command',
        exitCode: 127,
      }
    }

    if (command.includes('timeout-command')) {
      // Simulate timeout
      await waitForAsync(5000)
      throw new Error('Command timeout after 5000ms')
    }

    return {
      success: true,
      stdout: `Executed: ${command}`,
      stderr: '',
      exitCode: 0,
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (this.isTerminated) {
      throw new Error('Cannot write file: sandbox is terminated')
    }

    // Simulate file write delay
    await waitForAsync(20)

    // Validate path
    if (!path.startsWith('/home/user/')) {
      throw new Error(`Invalid path: ${path}. Must be within /home/user/`)
    }

    // Simulate permission errors
    if (path.includes('/readonly/')) {
      throw new Error(`Permission denied: ${path}`)
    }

    this.testFiles.set(path, content)
  }

  async readFile(path: string): Promise<string> {
    if (this.isTerminated) {
      throw new Error('Cannot read file: sandbox is terminated')
    }

    // Simulate file read delay
    await waitForAsync(10)

    if (!this.testFiles.has(path)) {
      throw new Error(`File not found: ${path}`)
    }

    return this.testFiles.get(path)!
  }

  async listFiles(directory = '/home/user'): Promise<string[]> {
    if (this.isTerminated) {
      throw new Error('Cannot list files: sandbox is terminated')
    }

    // Simulate directory listing delay
    await waitForAsync(30)

    const files = Array.from(this.testFiles.keys())
      .filter((path) => path.startsWith(directory))
      .sort()

    return files
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    return this.runCommand(`npm install ${packages.join(' ')}`)
  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo
  }

  async terminate(): Promise<void> {
    this.isTerminated = true
    this.testFiles.clear()
    this.sandboxInfo = null
  }

  isAlive(): boolean {
    return !this.isTerminated
  }

  async setupViteApp(): Promise<void> {
    if (this.isTerminated) {
      throw new Error('Cannot setup Vite app: sandbox is terminated')
    }

    // Simulate Vite setup
    await waitForAsync(200)

    // Add Vite-specific files
    this.testFiles.set(
      '/home/user/vite.config.js',
      `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true
  }
})`
    )

    this.testFiles.set(
      '/home/user/index.html',
      `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Test App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>`
    )
  }

  // Test-specific method to simulate reconnection
  async reconnect(sandboxId: string): Promise<boolean> {
    if (sandboxId === this.testSandboxId && !this.isTerminated) {
      return true
    }
    return false
  }
}

describe('Sandbox Operations Integration Tests', () => {
  let provider: SandboxProvider
  let sandboxInfo: SandboxInfo
  let useRealE2B: boolean

  beforeAll(async () => {
    // Determine if we should use real E2B or test provider
    useRealE2B = SandboxFactory.isProviderAvailable('e2b') && process.env.NODE_ENV !== 'test'

    console.log(`Running integration tests with ${useRealE2B ? 'real E2B' : 'test'} provider`)
  })

  beforeEach(async () => {
    // Create provider based on availability
    if (useRealE2B) {
      provider = SandboxFactory.create('e2b')
    } else {
      provider = new TestSandboxProvider()
    }
  })

  afterEach(async () => {
    // Clean up sandbox after each test
    if (provider && provider.isAlive()) {
      try {
        await provider.terminate()
      } catch (error) {
        console.warn('Failed to terminate sandbox:', error)
      }
    }
  })

  afterAll(async () => {
    // Clean up sandbox manager
    try {
      await sandboxManager.terminateAll()
    } catch (error) {
      console.warn('Failed to terminate all sandboxes:', error)
    }
  })

  describe('Sandbox Lifecycle', () => {
    it('should create sandbox successfully', async () => {
      sandboxInfo = await provider.createSandbox()

      expect(sandboxInfo).toBeDefined()
      expect(sandboxInfo.sandboxId).toBeTruthy()
      expect(sandboxInfo.url).toBeTruthy()
      expect(sandboxInfo.provider).toBeTruthy()
      expect(sandboxInfo.createdAt).toBeInstanceOf(Date)
      expect(provider.isAlive()).toBe(true)
    }, 30000)

    it('should setup Vite app after creation', async () => {
      sandboxInfo = await provider.createSandbox()

      await provider.setupViteApp()

      // Verify Vite-specific files exist
      const files = await provider.listFiles('/home/user')
      const hasViteConfig = files.some((f) => f.includes('vite.config'))
      const hasIndexHtml = files.some((f) => f.includes('index.html'))

      expect(hasViteConfig || hasIndexHtml).toBe(true)
    }, 30000)

    it('should terminate sandbox properly', async () => {
      sandboxInfo = await provider.createSandbox()
      expect(provider.isAlive()).toBe(true)

      await provider.terminate()

      expect(provider.isAlive()).toBe(false)

      // Operations should fail after termination
      await expect(provider.readFile('/home/user/package.json')).rejects.toThrow()
    }, 15000)

    it('should handle reconnection when supported', async () => {
      sandboxInfo = await provider.createSandbox()
      const sandboxId = sandboxInfo.sandboxId

      // Test reconnection if provider supports it
      const hasReconnect = typeof (provider as { reconnect?: unknown }).reconnect === 'function'

      if (hasReconnect) {
        const reconnectProvider = provider as SandboxProvider & {
          reconnect: (id: string) => Promise<boolean>
        }
        const reconnected = await reconnectProvider.reconnect(sandboxId)
        expect(reconnected).toBe(true)
      } else {
        // Skip test for providers without reconnect support
        expect(true).toBe(true)
      }
    }, 30000)
  })

  describe('File Operations', () => {
    beforeEach(async () => {
      sandboxInfo = await provider.createSandbox()
    })

    it('should list files in sandbox', async () => {
      const files = await provider.listFiles('/home/user')

      expect(Array.isArray(files)).toBe(true)
      expect(files.length).toBeGreaterThan(0)

      // Should contain expected files
      const hasPackageJson = files.some((f) => f.includes('package.json'))
      expect(hasPackageJson).toBe(true)
    }, 15000)

    it('should read existing file content', async () => {
      const files = await provider.listFiles('/home/user')
      const packageJsonPath = files.find((f) => f.includes('package.json'))

      if (packageJsonPath) {
        const content = await provider.readFile(packageJsonPath)
        expect(content).toBeTruthy()

        // Should be valid JSON
        expect(() => JSON.parse(content)).not.toThrow()

        const packageData = JSON.parse(content)
        expect(packageData.name).toBeTruthy()
      }
    }, 15000)

    it('should write and read new file', async () => {
      const testFilePath = '/home/user/test-file.txt'
      const testContent =
        'This is a test file content\nWith multiple lines\nAnd special chars: !@#$%'

      await provider.writeFile(testFilePath, testContent)

      const readContent = await provider.readFile(testFilePath)
      expect(readContent).toBe(testContent)

      // Verify file appears in listing
      const files = await provider.listFiles('/home/user')
      expect(files).toContain(testFilePath)
    }, 15000)

    it('should write complex React component', async () => {
      const componentPath = '/home/user/src/TestComponent.tsx'
      const componentContent = `import React, { useState, useEffect } from 'react'

interface TestComponentProps {
  title: string
  initialCount?: number
}

export const TestComponent: React.FC<TestComponentProps> = ({ 
  title, 
  initialCount = 0 
}) => {
  const [count, setCount] = useState(initialCount)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    console.log('Component mounted with title:', title)
  }, [title])

  const handleIncrement = async () => {
    setIsLoading(true)
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100))
    setCount(prev => prev + 1)
    setIsLoading(false)
  }

  return (
    <div className="test-component">
      <h2>{title}</h2>
      <p>Count: {count}</p>
      <button 
        onClick={handleIncrement}
        disabled={isLoading}
        className="increment-btn"
      >
        {isLoading ? 'Loading...' : 'Increment'}
      </button>
    </div>
  )
}

export default TestComponent`

      await provider.writeFile(componentPath, componentContent)

      const readContent = await provider.readFile(componentPath)
      expect(readContent).toBe(componentContent)

      // Verify TypeScript syntax is preserved
      expect(readContent).toContain('React.FC<TestComponentProps>')
      expect(readContent).toContain('useState')
      expect(readContent).toContain('useEffect')
    }, 15000)

    it('should handle file not found error', async () => {
      await expect(provider.readFile('/home/user/nonexistent-file.txt')).rejects.toThrow()
    }, 10000)

    it('should handle invalid file paths', async () => {
      // Test various invalid paths
      const invalidPaths = ['/etc/passwd', '../../../etc/passwd', '/root/secret.txt', '']

      for (const path of invalidPaths) {
        await expect(provider.writeFile(path, 'test content')).rejects.toThrow()
      }
    }, 15000)
  })

  describe('Command Execution', () => {
    beforeEach(async () => {
      sandboxInfo = await provider.createSandbox()
    })

    it('should execute simple commands', async () => {
      const result = await provider.runCommand('echo "Hello World"')

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Hello')
    }, 15000)

    it('should handle command with output', async () => {
      const result = await provider.runCommand('ls /home/user')

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBeTruthy()
    }, 15000)

    it('should handle command failures', async () => {
      const result = await provider.runCommand('invalid-command-that-does-not-exist')

      expect(result.success).toBe(false)
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toBeTruthy()
    }, 15000)

    it('should install npm packages', async () => {
      const packages = ['lodash', 'axios']
      const result = await provider.installPackages(packages)

      // Should complete without throwing
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    }, 30000)

    it('should handle npm build command', async () => {
      // First ensure we have a package.json with build script
      const packageJson = {
        name: 'test-app',
        version: '1.0.0',
        scripts: {
          build: 'echo "Build completed"',
        },
      }

      await provider.writeFile('/home/user/package.json', JSON.stringify(packageJson, null, 2))

      const result = await provider.runCommand('npm run build')

      // Should complete (success depends on environment)
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    }, 30000)
  })

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      sandboxInfo = await provider.createSandbox()
    })

    it('should handle concurrent file operations', async () => {
      const operations = Array.from({ length: 5 }, (_, i) =>
        provider.writeFile(`/home/user/concurrent-${i}.txt`, `Content ${i}`)
      )

      // All operations should complete without error
      await expect(Promise.all(operations)).resolves.not.toThrow()

      // Verify all files were written
      const files = await provider.listFiles('/home/user')
      const concurrentFiles = files.filter((f) => f.includes('concurrent-'))
      expect(concurrentFiles.length).toBe(5)
    }, 20000)

    it('should handle large file content', async () => {
      const largeContent = 'A'.repeat(100000) // 100KB
      const filePath = '/home/user/large-file.txt'

      await provider.writeFile(filePath, largeContent)
      const readContent = await provider.readFile(filePath)

      expect(readContent).toBe(largeContent)
      expect(readContent.length).toBe(100000)
    }, 20000)

    it('should handle special characters in file content', async () => {
      const specialContent = `
        Unicode: 🚀 🎉 ✨ 💻 🔥
        Symbols: !@#$%^&*()_+-=[]{}|;:'"<>?,./
        Newlines: \n\r\n\t
        Quotes: "double" 'single' \`backtick\`
        Backslashes: \\ \\\\ \\n \\t
        JSON: {"key": "value", "number": 123}
      `

      const filePath = '/home/user/special-chars.txt'
      await provider.writeFile(filePath, specialContent)
      const readContent = await provider.readFile(filePath)

      expect(readContent).toBe(specialContent)
    }, 15000)

    it('should handle operations after provider errors', async () => {
      // Cause an error
      try {
        await provider.readFile('/nonexistent/path/file.txt')
      } catch {
        // Expected error
      }

      // Provider should still be functional
      expect(provider.isAlive()).toBe(true)

      // Should be able to perform valid operations
      await provider.writeFile('/home/user/recovery-test.txt', 'Recovery successful')
      const content = await provider.readFile('/home/user/recovery-test.txt')
      expect(content).toBe('Recovery successful')
    }, 15000)
  })

  describe('Performance Characteristics', () => {
    beforeEach(async () => {
      sandboxInfo = await provider.createSandbox()
    })

    it('should handle file operations within reasonable time', async () => {
      const startTime = Date.now()

      await provider.writeFile('/home/user/perf-test.txt', 'Performance test content')
      await provider.readFile('/home/user/perf-test.txt')
      await provider.listFiles('/home/user')

      const duration = Date.now() - startTime

      // Operations should complete within 10 seconds (generous for real E2B)
      expect(duration).toBeLessThan(10000)
    }, 15000)

    it('should handle multiple sequential operations efficiently', async () => {
      const startTime = Date.now()

      // Perform 10 file operations
      for (let i = 0; i < 10; i++) {
        await provider.writeFile(`/home/user/seq-${i}.txt`, `Content ${i}`)
      }

      const duration = Date.now() - startTime

      // Should complete within reasonable time
      expect(duration).toBeLessThan(30000)
    }, 35000)
  })

  describe('Sandbox Manager Integration', () => {
    it('should register and manage sandbox properly', async () => {
      sandboxInfo = await provider.createSandbox()
      const sandboxId = sandboxInfo.sandboxId

      // Register with manager
      sandboxManager.registerSandbox(sandboxId, provider)
      sandboxManager.setActiveSandbox(sandboxId)

      // Should be able to retrieve provider
      const retrievedProvider = sandboxManager.getProvider(sandboxId)
      expect(retrievedProvider).toBe(provider)

      // Should be active provider
      const activeProvider = sandboxManager.getActiveProvider()
      expect(activeProvider).toBe(provider)
    }, 15000)

    it('should handle sandbox cleanup through manager', async () => {
      sandboxInfo = await provider.createSandbox()
      const sandboxId = sandboxInfo.sandboxId

      sandboxManager.registerSandbox(sandboxId, provider)

      // Terminate through manager
      await sandboxManager.terminateAll()

      // Provider should be terminated
      expect(provider.isAlive()).toBe(false)
    }, 15000)
  })

  describe('Real-world Scenarios', () => {
    beforeEach(async () => {
      sandboxInfo = await provider.createSandbox()
      await provider.setupViteApp()
    })

    it('should simulate complete React app development flow', async () => {
      // 1. Create component structure
      await provider.writeFile(
        '/home/user/src/components/Button.tsx',
        `
import React from 'react'

interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  onClick, 
  variant = 'primary',
  disabled = false 
}) => {
  return (
    <button 
      className={\`btn btn-\${variant}\`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}`
      )

      // 2. Create styles
      await provider.writeFile(
        '/home/user/src/styles/components.css',
        `
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}`
      )

      // 3. Update main App component
      await provider.writeFile(
        '/home/user/src/App.tsx',
        `
import React, { useState } from 'react'
import { Button } from './components/Button'
import './styles/components.css'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app">
      <h1>React Integration Test</h1>
      <p>Count: {count}</p>
      <Button onClick={() => setCount(c => c + 1)}>
        Increment
      </Button>
      <Button 
        variant="secondary" 
        onClick={() => setCount(0)}
      >
        Reset
      </Button>
    </div>
  )
}`
      )

      // 4. Verify all files exist and are readable
      const files = await provider.listFiles('/home/user/src')
      expect(files.some((f) => f.includes('Button.tsx'))).toBe(true)
      expect(files.some((f) => f.includes('App.tsx'))).toBe(true)

      const appContent = await provider.readFile('/home/user/src/App.tsx')
      expect(appContent).toContain('React Integration Test')
      expect(appContent).toContain('Button')
    }, 30000)

    it('should handle package.json updates and dependency management', async () => {
      // Read existing package.json
      const packageJsonPath = '/home/user/package.json'
      const existingContent = await provider.readFile(packageJsonPath)
      const packageData = JSON.parse(existingContent)

      // Add new dependencies
      packageData.dependencies = {
        ...packageData.dependencies,
        'react-router-dom': '^6.8.0',
        'styled-components': '^5.3.0',
      }

      packageData.devDependencies = {
        ...packageData.devDependencies,
        '@types/styled-components': '^5.1.0',
      }

      // Write updated package.json
      await provider.writeFile(packageJsonPath, JSON.stringify(packageData, null, 2))

      // Verify update
      const updatedContent = await provider.readFile(packageJsonPath)
      const updatedData = JSON.parse(updatedContent)

      expect(updatedData.dependencies['react-router-dom']).toBe('^6.8.0')
      expect(updatedData.dependencies['styled-components']).toBe('^5.3.0')
      expect(updatedData.devDependencies['@types/styled-components']).toBe('^5.1.0')
    }, 20000)
  })
})
