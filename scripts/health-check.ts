#!/usr/bin/env tsx

/**
 * Simple health check script for CI/CD
 * Verifies the application is responding on the expected port
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TIMEOUT = 10000 // 10 seconds

async function healthCheck(): Promise<void> {
  console.log(`Checking application health at: ${BASE_URL}`)

  try {
    const response = await fetch(`${BASE_URL}/api/health`, {
      method: 'GET',
      headers: {
        'User-Agent': 'AIBEXX-Health-Check/1.0',
      },
      signal: AbortSignal.timeout(TIMEOUT),
    })

    if (response.ok) {
      const data = await response.json()
      console.log('Health check passed:', data.status)
      process.exit(0)
    } else {
      console.error('Health check failed:', response.status, response.statusText)
      process.exit(1)
    }
  } catch (error) {
    console.error(
      '❌ Health check error:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    process.exit(1)
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\nHealth check interrupted')
  process.exit(1)
})

process.on('SIGTERM', () => {
  console.log('\nHealth check terminated')
  process.exit(1)
})

// Run the health check
healthCheck().catch((error) => {
  console.error('Health check failed:', error)
  process.exit(1)
})
