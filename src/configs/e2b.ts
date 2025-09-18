// E2B Sandbox Configuration
export const e2bConfig = {
  // Sandbox timeout in minutes (increased for better reliability)
  timeoutMinutes: 60,

  // Convert to milliseconds for E2B API
  get timeoutMs() {
    return this.timeoutMinutes * 60 * 1000
  },

  // Development server port (E2B uses 5173 for Vite)
  vitePort: 5173,

  // Time to wait for Vite dev server to be ready (in milliseconds)
  viteStartupDelay: 15000,

  // Working directory in sandbox
  workingDirectory: '/home/user/app',

  // File operation timeout in milliseconds
  fileOperationTimeoutMs: 90000, // 90 seconds per file operation
}

export default e2bConfig
