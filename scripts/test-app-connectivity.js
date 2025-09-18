#!/usr/bin/env node

/**
 * Simple connectivity test for CI/CD
 * Just checks if the app responds on localhost:3000
 */

const http = require('http')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

function checkHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}/api/health`, (res) => {
      if (res.statusCode === 200) {
        console.log('✅ App connectivity check passed')
        resolve(true)
      } else {
        console.log('❌ App connectivity check failed:', res.statusCode)
        reject(new Error(`HTTP ${res.statusCode}`))
      }
    })

    req.on('error', (err) => {
      console.log('❌ App connectivity check failed:', err.message)
      reject(err)
    })

    req.setTimeout(5000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

checkHealth()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
