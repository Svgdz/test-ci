// Code Application Configuration
export const codeApplicationConfig = {
  // Delay after applying code before refreshing iframe (milliseconds)
  defaultRefreshDelay: 2000,

  // Delay when packages are installed (milliseconds)
  packageInstallRefreshDelay: 5000,

  // Enable/disable automatic truncation recovery
  enableTruncationRecovery: false, // Disabled - too many false positives

  // Maximum number of truncation recovery attempts per file
  maxTruncationRecoveryAttempts: 1,
}

export default codeApplicationConfig
