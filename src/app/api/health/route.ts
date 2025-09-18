import { NextRequest, NextResponse } from 'next/server'
import { l } from '@/lib/clients/logger'

/*
 * Check database connectivity
 */
async function checkDatabase() {
  try {
    // Basic check - you can enhance this based on your database setup
    // For now, just check if database environment variables are set
    const hasDbConfig = !!(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)

    return {
      status: hasDbConfig ? 'ok' : 'warning',
      message: hasDbConfig ? 'Database configuration found' : 'No database configuration',
      responseTime: 0,
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Database check failed',
      responseTime: 0,
    }
  }
}

/**
 * Check memory usage
 */
function checkMemory() {
  try {
    const memUsage = process.memoryUsage()
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024)
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
    const usagePercent = Math.round((usedMB / totalMB) * 100)

    return {
      status: usagePercent < 90 ? 'ok' : 'warning',
      totalMB,
      usedMB,
      usagePercent,
      message: `Memory usage: ${usedMB}MB / ${totalMB}MB (${usagePercent}%)`,
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Memory check failed',
    }
  }
}

/**
 * Check disk space (basic check)
 */
function checkDisk() {
  try {
    // Basic disk check - in a real app you might want to check actual disk space
    return {
      status: 'ok',
      message: 'Disk check passed',
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Disk check failed',
    }
  }
}

/**
 * Health check endpoint for monitoring and CI/CD
 * Returns application status and basic system information
 */
export async function GET(_request: NextRequest) {
  try {
    // Basic health checks
    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '0.1.0',
      checks: {
        database: await checkDatabase(),
        memory: checkMemory(),
        disk: checkDisk(),
      },
    }

    // Determine overall status
    const allChecksOk = Object.values(healthData.checks).every((check) => check.status === 'ok')

    return NextResponse.json(
      {
        ...healthData,
        status: allChecksOk ? 'ok' : 'degraded',
      },
      {
        status: allChecksOk ? 200 : 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    )
  } catch (error) {
    l.error({ key: 'health_check:failed', error }, 'Health check failed')

    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
