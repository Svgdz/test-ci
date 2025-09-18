import { Sandbox } from '@e2b/code-interpreter'
import { SandboxProvider, SandboxInfo, CommandResult } from '../types'
// SandboxProviderConfig available through parent class
import { appConfig } from '@/configs'

// Type definitions for E2B sandbox operations
interface E2BSandbox {
  sandboxId: string
  setTimeout?: (timeout: number) => Promise<void> | void
  getHostname?: (port: number) => string
  getHost?: (port: number) => string
  betaPause?: () => Promise<boolean>
  connect?: () => Promise<E2BSandbox>
  runCode: (code: string) => Promise<{
    logs: {
      stdout: string[]
      stderr: string[]
    }
    error?: unknown
  }>
  filesystem?: {
    write?: (
      path: string,
      content: string,
      options?: { requestTimeoutMs?: number }
    ) => Promise<void>
    read?: (path: string, options?: { requestTimeoutMs?: number }) => Promise<string>
    list?: (
      path: string,
      options?: { requestTimeoutMs?: number }
    ) => Promise<Array<{ type: string; path: string }>>
  }
  kill: () => Promise<void>
}

export class E2BProvider extends SandboxProvider {
  private existingFiles: Set<string> = new Set()

  // Override the sandbox property with proper typing
  protected sandbox: E2BSandbox | null = null

  /**
   * Attempt to reconnect to an existing E2B sandbox
   */
  async reconnect(sandboxId: string): Promise<boolean> {
    try {
      console.log(`[E2BProvider] Attempting to reconnect to sandbox ${sandboxId}`)

      // Try to connect to existing sandbox using the new E2B v2 API with extended timeout
      this.sandbox = (await Sandbox.connect(sandboxId, {
        apiKey: this.config.e2b?.apiKey || process.env.E2B_API_KEY,
        timeoutMs: this.config.e2b?.timeoutMs || 60 * 60 * 1000, // 60 minutes for reconnection
      })) as E2BSandbox

      // Set extended timeout on the sandbox instance for file operations
      try {
        if (this.sandbox.setTimeout) {
          await this.sandbox.setTimeout(30 * 60 * 1000) // 30 minutes for file operations
        }
      } catch (timeoutError: unknown) {
        console.warn(`[E2BProvider] Could not set extended timeout:`, timeoutError)
      }

      // Update sandbox info with proper URL construction
      const actualSandboxId = this.sandbox.sandboxId
      let sdkUrl: string | null = null

      try {
        // Try to get URL from SDK methods for logging/debugging
        if (this.sandbox.getHostname) {
          sdkUrl = this.sandbox.getHostname(appConfig.e2b.vitePort)
          console.log(`[E2BProvider] SDK getHostname() returned on reconnect: ${sdkUrl}`)
        } else if (this.sandbox.getHost) {
          sdkUrl = this.sandbox.getHost(appConfig.e2b.vitePort)
          console.log(`[E2BProvider] SDK getHost() returned on reconnect: ${sdkUrl}`)
        }
      } catch (error: unknown) {
        console.warn(`[E2BProvider] SDK hostname method failed on reconnect:`, error)
      }

      // Always construct URL with correct E2B v2 format: port-sandboxId.e2b.dev
      const url = `https://${appConfig.e2b.vitePort}-${actualSandboxId}.e2b.dev`
      console.log(`[E2BProvider] Using constructed E2B v2 URL format on reconnect: ${url}`)

      if (sdkUrl && sdkUrl !== `${appConfig.e2b.vitePort}-${actualSandboxId}.e2b.dev`) {
        console.warn(`[E2BProvider] SDK URL (${sdkUrl}) differs from constructed URL on reconnect`)
      }

      this.sandboxInfo = {
        sandboxId: actualSandboxId,
        url,
        provider: 'e2b',
        createdAt: new Date(),
      }

      console.log(`[E2BProvider] Successfully reconnected to sandbox ${actualSandboxId}`)
      return true
    } catch (error: unknown) {
      console.error(`[E2BProvider] Failed to reconnect to sandbox ${sandboxId}:`, error)
      return false
    }
  }

  /**
   * Pause the sandbox to preserve state while stopping compute
   */
  async pauseSandbox(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox to pause')
    }

    try {
      console.log(`[E2BProvider] Pausing sandbox ${this.sandbox.sandboxId}`)
      if (this.sandbox.betaPause) {
        await this.sandbox.betaPause()
      }

      // Sandbox paused successfully

      console.log(`[E2BProvider] Sandbox ${this.sandbox.sandboxId} paused successfully`)
    } catch (error: unknown) {
      console.error(`[E2BProvider] Failed to pause sandbox:`, error)
      throw error
    }
  }

  /**
   * Resume a paused sandbox
   */
  async resumeSandbox(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No sandbox instance to resume')
    }

    try {
      console.log(`[E2BProvider] Resuming sandbox ${this.sandbox.sandboxId}`)

      // Connect will automatically resume if paused
      if (this.sandbox.connect) {
        this.sandbox = await this.sandbox.connect()
      }

      // Sandbox resumed successfully

      console.log(`[E2BProvider] Sandbox ${this.sandbox.sandboxId} resumed successfully`)
    } catch (error: unknown) {
      console.error(`[E2BProvider] Failed to resume sandbox:`, error)
      throw error
    }
  }

  /**
   * List all paused sandboxes
   */
  static async listPausedSandboxes(): Promise<unknown[]> {
    try {
      const paginator = Sandbox.list({ query: { state: ['paused'] } })
      const sandboxes = []

      // Get all paused sandboxes
      while (paginator.hasNext) {
        const items = await paginator.nextItems()
        sandboxes.push(...items)
      }

      return sandboxes
    } catch (error: unknown) {
      console.error('[E2BProvider] Failed to list paused sandboxes:', error)
      return []
    }
  }

  async createSandbox(): Promise<SandboxInfo> {
    try {
      // Kill existing sandbox if any
      if (this.sandbox) {
        try {
          await this.sandbox.kill()
        } catch (e: unknown) {
          console.error('Failed to kill existing sandbox:', e)
        }
        this.sandbox = null
      }

      // Clear existing files tracking
      this.existingFiles.clear()

      // Create Code Interpreter sandbox with extended timeout
      this.sandbox = (await Sandbox.create({
        apiKey: this.config.e2b?.apiKey || process.env.E2B_API_KEY,
        timeoutMs: this.config.e2b?.timeoutMs || 30 * 60 * 1000, // 30 minutes for file operations
      })) as E2BSandbox

      const sandboxId = this.sandbox.sandboxId

      // For E2B v2, always construct URL with correct port format
      // The E2B SDK methods often return base URLs without port prefixes
      // So we'll construct the correct format manually
      let sdkUrl: string | null = null

      try {
        // Try to get URL from SDK methods for logging/debugging
        if (this.sandbox.getHostname) {
          sdkUrl = this.sandbox.getHostname(appConfig.e2b.vitePort)
          console.log(`[E2BProvider] SDK getHostname() returned: ${sdkUrl}`)
        } else if (this.sandbox.getHost) {
          sdkUrl = this.sandbox.getHost(appConfig.e2b.vitePort)
          console.log(`[E2BProvider] SDK getHost() returned: ${sdkUrl}`)
        }
      } catch (error: unknown) {
        console.warn(`[E2BProvider] SDK hostname method failed:`, error)
      }

      // Always construct URL with correct E2B v2 format: port-sandboxId.e2b.dev
      const url = `https://${appConfig.e2b.vitePort}-${sandboxId}.e2b.dev`
      console.log(`[E2BProvider] Using constructed E2B v2 URL format: ${url}`)

      if (sdkUrl && sdkUrl !== `${appConfig.e2b.vitePort}-${sandboxId}.e2b.dev`) {
        console.warn(`[E2BProvider] SDK URL (${sdkUrl}) differs from constructed URL (${url})`)
      }

      this.sandboxInfo = {
        sandboxId,
        url,
        provider: 'e2b',
        createdAt: new Date(),
      }

      // Set extended timeout on the sandbox instance if method available
      if (this.sandbox.setTimeout) {
        void this.sandbox.setTimeout(appConfig.e2b.timeoutMs)
      }

      return this.sandboxInfo
    } catch (error: unknown) {
      console.error('[E2BProvider] Error creating sandbox:', error)
      throw error
    }
  }

  async runCommand(command: string): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox')
    }

    // Extend sandbox timeout before command execution
    try {
      if (this.sandbox.setTimeout) {
        await this.sandbox.setTimeout(10 * 60 * 1000) // 10 minutes for commands
      }
    } catch (error: unknown) {
      console.warn('Could not extend sandbox timeout for command:', error)
    }

    const result = await this.sandbox.runCode(`
      import subprocess
      import os

      os.chdir('/home/user/app')
      result = subprocess.run(${JSON.stringify(command.split(' '))}, 
                            capture_output=True, 
                            text=True, 
                            shell=False)

      print("STDOUT:")
      print(result.stdout)
      if result.stderr:
          print("\\nSTDERR:")
          print(result.stderr)
      print(f"\\nReturn code: {result.returncode}")
    `)

    const output = result.logs.stdout.join('\n')
    const stderr = result.logs.stderr.join('\n')

    return {
      stdout: output,
      stderr,
      exitCode: result.error ? 1 : 0,
      success: !result.error,
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox')
    }

    const fullPath = path.startsWith('/') ? path : `/home/user/app/${path}`

    // Extend sandbox timeout before file operations
    try {
      if (this.sandbox.setTimeout) {
        await this.sandbox.setTimeout(15 * 60 * 1000) // 15 minutes for file operations
      }
    } catch (error: unknown) {
      console.warn('Could not extend sandbox timeout:', error)
    }

    // Try filesystem API first with timeout and retry logic
    if (this.sandbox.filesystem?.write) {
      let retries = 3
      while (retries > 0) {
        try {
          await this.sandbox.filesystem.write(fullPath, content, {
            requestTimeoutMs: appConfig.e2b.fileOperationTimeoutMs,
          }) // Configurable request timeout per operation
          this.existingFiles.add(path)
          return
        } catch (fsError: unknown) {
          retries--
          if (retries === 0) {
            console.warn(
              `Filesystem API failed for ${fullPath} after retries, falling back to Python:`,
              fsError
            )
            break
          }
          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    // Fallback to Python code execution with retry
    let retries = 3
    while (retries > 0) {
      try {
        await this.sandbox.runCode(`
import os
import time

try:
    # Ensure directory exists
    dir_path = os.path.dirname("${fullPath}")
    os.makedirs(dir_path, exist_ok=True)

    # Write file with proper encoding
    with open("${fullPath}", 'w', encoding='utf-8') as f:
        f.write(${JSON.stringify(content)})
    print(f"✓ Written: ${fullPath}")
except Exception as e:
    print(f"❌ Failed to write ${fullPath}: {str(e)}")
    raise e
        `)
        this.existingFiles.add(path)
        return
      } catch (error: unknown) {
        retries--
        if (retries === 0) {
          throw new Error(
            `Failed to write file ${fullPath} after retries: ${error instanceof Error ? error.message : String(error)}`
          )
        }
        console.warn(`Write attempt failed for ${fullPath}, retrying... (${retries} left)`, error)
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
  }

  async readFile(path: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error('No active sandbox')
    }

    const fullPath = path.startsWith('/') ? path : `/home/user/app/${path}`

    // Extend sandbox timeout before file reading
    try {
      if (this.sandbox.setTimeout) {
        await this.sandbox.setTimeout(10 * 60 * 1000) // 10 minutes for file operations
      }
    } catch (error: unknown) {
      console.warn('Could not extend sandbox timeout for readFile:', error)
    }

    // Try filesystem API first
    if (this.sandbox.filesystem?.read) {
      try {
        const content = await this.sandbox.filesystem.read(fullPath, {
          requestTimeoutMs: appConfig.e2b.fileOperationTimeoutMs,
        }) // Configurable request timeout
        return content
      } catch (fsError: unknown) {
        console.warn(
          `Filesystem API failed for reading ${fullPath}, falling back to Python:`,
          fsError
        )
      }
    }

    // Fallback to Python
    const result = await this.sandbox.runCode(`
      with open("${fullPath}", 'r') as f:
          content = f.read()
      print(content)
    `)

    return result.logs.stdout.join('\n')
  }

  async listFiles(directory: string = '/home/user/app'): Promise<string[]> {
    if (!this.sandbox) {
      throw new Error('No active sandbox')
    }

    // Extend sandbox timeout before file listing
    try {
      if (this.sandbox.setTimeout) {
        await this.sandbox.setTimeout(30 * 60 * 1000) // 30 minutes for file operations
      }
    } catch (error: unknown) {
      console.warn('Could not extend sandbox timeout for listFiles:', error)
    }

    // Try filesystem API first with retry logic
    if (this.sandbox.filesystem?.list) {
      let retries = 3
      while (retries > 0) {
        try {
          const files = await this.sandbox.filesystem.list(directory, {
            requestTimeoutMs: appConfig.e2b.fileOperationTimeoutMs,
          }) // Configurable request timeout
          // Filter out directories and unwanted files, return relative paths
          return files
            .filter((file: { type: string; path: string }) => file.type === 'file')
            .map((file: { type: string; path: string }) => file.path.replace(directory + '/', ''))
            .filter((path: string) => !path.includes('node_modules') && !path.includes('.git'))
        } catch (fsError: unknown) {
          retries--
          if (retries === 0) {
            console.warn(
              `Filesystem API failed for listing ${directory} after retries, falling back to Python:`,
              fsError
            )
            break
          }
          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      }
    }

    // Fallback to Python
    const result = await this.sandbox.runCode(`
      import os
      import json

      def list_files(path):
          files = []
          for root, dirs, filenames in os.walk(path):
              # Skip node_modules and .git
              dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', '.next', 'dist', 'build']]
              for filename in filenames:
                  rel_path = os.path.relpath(os.path.join(root, filename), path)
                  files.append(rel_path)
          return files

      files = list_files("${directory}")
      print(json.dumps(files))
    `)

    try {
      return JSON.parse(result.logs.stdout.join('')) as string[]
    } catch {
      return []
    }
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox')
    }

    const result = await this.sandbox.runCode(`
      import subprocess
      import os

      os.chdir('/home/user/app')

      # Install packages
      packages_list = ${JSON.stringify(['npm', 'install', ...packages])}
      result = subprocess.run(
          packages_list,
          capture_output=True,
          text=True
      )

      print("STDOUT:")
      print(result.stdout)
      if result.stderr:
          print("\\nSTDERR:")
          print(result.stderr)
      print(f"\\nReturn code: {result.returncode}")
    `)

    const output = result.logs.stdout.join('\n')
    const stderr = result.logs.stderr.join('\n')

    // Restart Vite is not auto-triggered; caller can decide when to restart

    return {
      stdout: output,
      stderr,
      exitCode: result.error ? 1 : 0,
      success: !result.error,
    }
  }

  async setupViteApp(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox')
    }

    // Write all files in a single Python script
    const setupScript = `
import os
import json

print('Setting up React app with Vite and Tailwind...')

# Create directory structure
os.makedirs('/home/user/app/src', exist_ok=True)

# Package.json
package_json = {
  "name": "vite-react-typescript",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^0.344.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.9.1",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.18",
    "eslint": "^9.9.1",
    "eslint-plugin-react-hooks": "^5.1.0-rc.0",
    "eslint-plugin-react-refresh": "^0.4.11",
    "globals": "^15.9.0",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.5.3",
    "typescript-eslint": "^8.3.0",
    "vite": "^5.4.2"
  }
}

with open('/home/user/app/package.json', 'w') as f:
    json.dump(package_json, f, indent=2)
print('✓ package.json')

# Vite config
vite_config = """import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: false,
    allowedHosts: ['.e2b.app', '.e2b.dev', 'localhost', '127.0.0.1']
  }
})"""

with open('/home/user/app/vite.config.js', 'w') as f:
    f.write(vite_config)
print('✓ vite.config.js')

# Tailwind config
tailwind_config = """/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}"""

with open('/home/user/app/tailwind.config.js', 'w') as f:
    f.write(tailwind_config)
print('✓ tailwind.config.js')

# PostCSS config
postcss_config = """export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}"""

with open('/home/user/app/postcss.config.js', 'w') as f:
    f.write(postcss_config)
print('✓ postcss.config.js')

# Index.html
index_html = """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>"""

with open('/home/user/app/index.html', 'w') as f:
    f.write(index_html)
print('✓ index.html')

# Main.tsx
main_tsx = """import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)"""

with open('/home/user/app/src/main.tsx', 'w') as f:
    f.write(main_tsx)
print('✓ src/main.tsx')

# App.tsx
app_tsx = """function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <p className="text-lg text-gray-400">
          Sandbox Ready<br/>
          Start building your React app with Vite and Tailwind CSS!
        </p>
      </div>
    </div>
  )
}

export default App"""

with open('/home/user/app/src/App.tsx', 'w') as f:
    f.write(app_tsx)
print('✓ src/App.tsx')

# Index.css
index_css = """@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}"""

with open('/home/user/app/src/index.css', 'w') as f:
    f.write(index_css)
print('✓ src/index.css')

print('\\nAll files created successfully!')
`

    await this.sandbox.runCode(setupScript)

    // Install dependencies
    await this.sandbox.runCode(`
import subprocess

print('Installing npm packages...')
result = subprocess.run(
    ['npm', 'install'],
    cwd='/home/user/app',
    capture_output=True,
    text=True
)

if result.returncode == 0:
    print('✓ Dependencies installed successfully')
else:
    print(f'⚠ Warning: npm install had issues: {result.stderr}')
    `)

    // Start Vite dev server
    await this.sandbox.runCode(`
import subprocess
import os
import time

os.chdir('/home/user/app')

# Kill any existing Vite processes
subprocess.run(['pkill', '-f', 'vite'], capture_output=True)
time.sleep(1)

# Start Vite dev server
env = os.environ.copy()
env['FORCE_COLOR'] = '0'

process = subprocess.Popen(
    ['npm', 'run', 'dev'],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env
)

print(f'✓ Vite dev server started with PID: {process.pid}')
print('Waiting for server to be ready...')
    `)

    // Wait for Vite to be ready and verify it's responding
    await new Promise((resolve) => setTimeout(resolve, appConfig.e2b.viteStartupDelay))

    // Health check to verify Vite server is responding
    try {
      await this.sandbox.runCode(`
import requests
import time

# Try to connect to the Vite server
max_attempts = 10
for attempt in range(max_attempts):
    try:
        response = requests.get('http://localhost:5173', timeout=5)
        if response.status_code == 200:
            print(f'✓ Vite server is responding (attempt {attempt + 1})')
            break
    except Exception as e:
        if attempt == max_attempts - 1:
            print(f'⚠ Warning: Vite server health check failed after {max_attempts} attempts')
        else:
            print(f'Attempt {attempt + 1}: Waiting for Vite server... ({e})')
            time.sleep(2)
      `)
    } catch (healthCheckError) {
      console.warn('[E2BProvider] Vite health check failed:', healthCheckError)
    }

    // Track initial files
    this.existingFiles.add('src/App.tsx')
    this.existingFiles.add('src/main.tsx')
    this.existingFiles.add('src/index.css')
    this.existingFiles.add('index.html')
    this.existingFiles.add('package.json')
    this.existingFiles.add('vite.config.js')
    this.existingFiles.add('tailwind.config.js')
    this.existingFiles.add('postcss.config.js')
  }

  async restartViteServer(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox')
    }

    await this.sandbox.runCode(`
import subprocess
import time
import os

os.chdir('/home/user/app')

# Kill existing Vite process
subprocess.run(['pkill', '-f', 'vite'], capture_output=True)
time.sleep(2)

# Start Vite dev server
env = os.environ.copy()
env['FORCE_COLOR'] = '0'

process = subprocess.Popen(
    ['npm', 'run', 'dev'],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env
)

print(f'✓ Vite restarted with PID: {process.pid}')
    `)

    // Wait for Vite to be ready
    await new Promise((resolve) => setTimeout(resolve, appConfig.e2b.viteStartupDelay))
  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo
  }

  /**
   * Check if the Vite dev server is running and accessible
   */
  async isViteServerReady(): Promise<boolean> {
    if (!this.sandbox) {
      return false
    }

    try {
      const result = await this.sandbox.runCode(`
import requests
try:
    response = requests.get('http://localhost:5173', timeout=3)
    print('VITE_STATUS_OK' if response.status_code == 200 else 'VITE_STATUS_ERROR')
except Exception as e:
    print('VITE_STATUS_ERROR')
      `)

      const output = result.logs.stdout.join('').trim()
      return output.includes('VITE_STATUS_OK')
    } catch (error: unknown) {
      console.warn('[E2BProvider] Error checking Vite server status:', error)
      return false
    }
  }

  async terminate(): Promise<void> {
    if (this.sandbox) {
      try {
        await this.sandbox.kill()
      } catch (e: unknown) {
        console.error('Failed to terminate sandbox:', e)
      }
      this.sandbox = null
      this.sandboxInfo = null
    }
  }

  isAlive(): boolean {
    return !!this.sandbox
  }
}
