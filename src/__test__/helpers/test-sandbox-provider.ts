import { SandboxProvider, SandboxInfo, CommandResult } from '@/server/sandbox/types'
import { waitForAsync } from './test-data'

/**
 * Test Sandbox Provider
 *
 * A real implementation of SandboxProvider for testing purposes.
 * This provides actual functionality without external dependencies,
 * allowing for comprehensive testing without false positives from mocks.
 */
export class TestSandboxProvider extends SandboxProvider {
  private testSandboxId: string
  private testFiles: Map<string, string> = new Map()
  private isTerminated = false
  private testUrl: string
  private createdAt: Date

  constructor(config = {}) {
    super(config)
    this.testSandboxId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.testUrl = `https://test-${this.testSandboxId}.local.dev`
    this.createdAt = new Date()

    this.initializeDefaultFiles()
  }

  private initializeDefaultFiles() {
    // Initialize with realistic project structure
    this.testFiles.set(
      '/home/user/package.json',
      JSON.stringify(
        {
          name: 'test-app',
          version: '1.0.0',
          private: true,
          scripts: {
            dev: 'vite',
            build: 'vite build',
            preview: 'vite preview',
            test: 'vitest',
          },
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
          },
          devDependencies: {
            '@types/react': '^18.2.0',
            '@types/react-dom': '^18.2.0',
            '@vitejs/plugin-react': '^4.0.0',
            typescript: '^5.0.0',
            vite: '^4.0.0',
            vitest: '^0.34.0',
          },
        },
        null,
        2
      )
    )

    this.testFiles.set(
      '/home/user/src/App.tsx',
      `import React from 'react'
import './App.css'

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Test React Application</h1>
        <p>This is a test sandbox environment</p>
      </header>
    </div>
  )
}

export default App`
    )

    this.testFiles.set(
      '/home/user/src/main.tsx',
      `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`
    )

    this.testFiles.set(
      '/home/user/src/App.css',
      `.App {
  text-align: center;
}

.App-header {
  background-color: #282c34;
  padding: 20px;
  color: white;
}

.App-header h1 {
  margin: 0 0 10px 0;
}`
    )

    this.testFiles.set(
      '/home/user/src/index.css',
      `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  height: 100vh;
}`
    )

    this.testFiles.set(
      '/home/user/index.html',
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Test App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`
    )

    this.testFiles.set(
      '/home/user/tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2020',
            useDefineForClassFields: true,
            lib: ['ES2020', 'DOM', 'DOM.Iterable'],
            module: 'ESNext',
            skipLibCheck: true,
            moduleResolution: 'bundler',
            allowImportingTsExtensions: true,
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: 'react-jsx',
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noFallthroughCasesInSwitch: true,
          },
          include: ['src'],
          references: [{ path: './tsconfig.node.json' }],
        },
        null,
        2
      )
    )
  }

  async createSandbox(): Promise<SandboxInfo> {
    if (this.isTerminated) {
      throw new Error('Cannot create sandbox: provider is terminated')
    }

    // Simulate network delay for realistic testing
    await waitForAsync(Math.random() * 200 + 50) // 50-250ms

    this.sandboxInfo = {
      sandboxId: this.testSandboxId,
      url: this.testUrl,
      provider: 'test',
      createdAt: this.createdAt,
    }

    return this.sandboxInfo
  }

  async runCommand(command: string): Promise<CommandResult> {
    if (this.isTerminated) {
      throw new Error('Cannot run command: sandbox is terminated')
    }

    // Simulate command execution delay
    await waitForAsync(Math.random() * 100 + 25) // 25-125ms

    // Simulate realistic command behaviors
    const cmd = command.trim().toLowerCase()

    if (
      cmd.includes('npm install') ||
      cmd.includes('yarn install') ||
      cmd.includes('pnpm install')
    ) {
      return {
        success: true,
        stdout: `added 847 packages, and audited 848 packages in 12s\n\n118 packages are looking for funding\n  run \`npm fund\` for details\n\nfound 0 vulnerabilities`,
        stderr: '',
        exitCode: 0,
      }
    }

    if (cmd.includes('npm run build') || cmd.includes('yarn build') || cmd.includes('pnpm build')) {
      return {
        success: true,
        stdout: `> test-app@1.0.0 build\n> vite build\n\nvite v4.4.5 building for production...\n✓ 34 modules transformed.\ndist/index.html                   0.46 kB │ gzip:  0.30 kB\ndist/assets/index-d526a0c5.css   1.42 kB │ gzip:  0.74 kB\ndist/assets/index-30c0b4dc.js  143.61 kB │ gzip: 46.11 kB\n✓ built in 2.34s`,
        stderr: '',
        exitCode: 0,
      }
    }

    if (cmd.includes('npm test') || cmd.includes('yarn test') || cmd.includes('pnpm test')) {
      return {
        success: true,
        stdout: `> test-app@1.0.0 test\n> vitest\n\n DEV  v0.34.6\n\n ✓ src/App.test.tsx (1)\n   ✓ renders learn react link\n\n Test Files  1 passed (1)\n      Tests  1 passed (1)\n   Start at 10:30:25\n   Duration  1.23s (transform 89ms, setup 0ms, collect 45ms, tests 12ms)`,
        stderr: '',
        exitCode: 0,
      }
    }

    if (cmd.startsWith('ls')) {
      const path = cmd.includes('/home/user') ? cmd.split('/home/user')[1] || '' : ''
      const targetPath = `/home/user${path}`.replace(/\/+$/, '') || '/home/user'

      const files = Array.from(this.testFiles.keys())
        .filter((f) => f.startsWith(targetPath) && f !== targetPath)
        .map((f) => f.replace(targetPath + '/', '').split('/')[0])
        .filter((f, i, arr) => arr.indexOf(f) === i)
        .sort()

      return {
        success: true,
        stdout: files.join('\n'),
        stderr: '',
        exitCode: 0,
      }
    }

    if (cmd.startsWith('cat ')) {
      const filePath = cmd.replace('cat ', '').trim()
      const fullPath = filePath.startsWith('/') ? filePath : `/home/user/${filePath}`

      if (this.testFiles.has(fullPath)) {
        return {
          success: true,
          stdout: this.testFiles.get(fullPath)!,
          stderr: '',
          exitCode: 0,
        }
      } else {
        return {
          success: false,
          stdout: '',
          stderr: `cat: ${filePath}: No such file or directory`,
          exitCode: 1,
        }
      }
    }

    if (cmd.startsWith('echo ')) {
      const message = command.substring(5).replace(/^["']|["']$/g, '')
      return {
        success: true,
        stdout: message,
        stderr: '',
        exitCode: 0,
      }
    }

    // Simulate dangerous commands
    if (
      cmd.includes('rm -rf /') ||
      cmd.includes('sudo') ||
      cmd.includes('curl http') ||
      cmd.includes('wget http')
    ) {
      return {
        success: false,
        stdout: '',
        stderr: 'Permission denied: dangerous command blocked',
        exitCode: 126,
      }
    }

    // Unknown command
    if (cmd.includes('invalid-command') || cmd.includes('nonexistent')) {
      return {
        success: false,
        stdout: '',
        stderr: `command not found: ${command.split(' ')[0]}`,
        exitCode: 127,
      }
    }

    // Simulate timeout for specific commands
    if (cmd.includes('timeout-command') || cmd.includes('sleep 1000')) {
      await waitForAsync(5000)
      throw new Error('Command timeout after 5000ms')
    }

    // Default successful execution
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
    await waitForAsync(Math.random() * 50 + 10) // 10-60ms

    // Validate path security
    if (!this.isValidPath(path)) {
      throw new Error(`Invalid path: ${path}. Must be within /home/user/`)
    }

    // Simulate permission errors
    if (path.includes('/readonly/') || path.includes('/etc/') || path.includes('/root/')) {
      throw new Error(`Permission denied: ${path}`)
    }

    // Simulate disk space error for very large files
    if (content.length > 10 * 1024 * 1024) {
      // 10MB
      throw new Error('No space left on device')
    }

    this.testFiles.set(path, content)
  }

  async readFile(path: string): Promise<string> {
    if (this.isTerminated) {
      throw new Error('Cannot read file: sandbox is terminated')
    }

    // Simulate file read delay
    await waitForAsync(Math.random() * 30 + 5) // 5-35ms

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
    await waitForAsync(Math.random() * 60 + 20) // 20-80ms

    const normalizedDir = directory.endsWith('/') ? directory.slice(0, -1) : directory

    const files = Array.from(this.testFiles.keys())
      .filter((path) => path.startsWith(normalizedDir))
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

    // Simulate Vite setup delay
    await waitForAsync(Math.random() * 300 + 100) // 100-400ms

    // Add Vite configuration
    this.testFiles.set(
      '/home/user/vite.config.ts',
      `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})`
    )

    // Add additional development files
    this.testFiles.set(
      '/home/user/.gitignore',
      `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?`
    )

    this.testFiles.set(
      '/home/user/README.md',
      `# Test App

This is a test React application created for sandbox testing.

## Available Scripts

- \`npm run dev\` - Start development server
- \`npm run build\` - Build for production
- \`npm run preview\` - Preview production build
- \`npm test\` - Run tests`
    )
  }

  // Test-specific method to simulate reconnection
  async reconnect(sandboxId: string): Promise<boolean> {
    if (sandboxId === this.testSandboxId && !this.isTerminated) {
      // Simulate reconnection delay
      await waitForAsync(Math.random() * 500 + 200) // 200-700ms
      return true
    }
    return false
  }

  // Helper method to validate paths
  private isValidPath(path: string): boolean {
    const normalizedPath = path.replace(/\/+/g, '/').replace(/\/\.\.\//g, '/')
    return (
      normalizedPath.startsWith('/home/user/') &&
      !normalizedPath.includes('/../') &&
      !normalizedPath.includes('/etc/') &&
      !normalizedPath.includes('/root/')
    )
  }

  // Test-specific method to simulate errors
  async simulateError(
    errorType: 'network' | 'permission' | 'timeout' | 'disk-full'
  ): Promise<never> {
    await waitForAsync(100) // Simulate some delay before error

    switch (errorType) {
      case 'network':
        throw new Error('ECONNREFUSED: Connection refused')
      case 'permission':
        throw new Error('EACCES: Permission denied')
      case 'timeout':
        throw new Error('ETIMEDOUT: Operation timed out')
      case 'disk-full':
        throw new Error('ENOSPC: No space left on device')
      default:
        throw new Error('Unknown error')
    }
  }

  // Test-specific method to get internal state
  getTestState() {
    return {
      sandboxId: this.testSandboxId,
      fileCount: this.testFiles.size,
      isTerminated: this.isTerminated,
      createdAt: this.createdAt,
      files: Array.from(this.testFiles.keys()).sort(),
    }
  }
}
