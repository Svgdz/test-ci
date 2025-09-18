import { NextRequest, NextResponse } from 'next/server'
import { checkAuthenticated } from '@/lib/utils/server'
import { writeSandboxFileAction } from '@/server/sandbox/write-file'
import { sandboxManager } from '@/server/sandbox/manager'
import { l } from '@/lib/clients/logger'

/*
 * OPTIONS handler for CORS preflight requests
 * CORS headers are handled globally in next.config.ts
 */
export async function OPTIONS(_request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
  })
}

/*
 * Read a single file from sandbox
 */
export async function GET(request: NextRequest) {
  try {
    await checkAuthenticated()

    const { searchParams } = new URL(request.url)
    const sandboxId = searchParams.get('sandboxId')
    const filePath = searchParams.get('filePath')

    if (!filePath) {
      return NextResponse.json(
        { success: false, serverError: 'File path is required' },
        { status: 400 }
      )
    }

    /*
     * Get sandbox provider and read file content
     */
    const provider = sandboxId
      ? sandboxManager.getProvider(sandboxId)
      : sandboxManager.getActiveProvider()

    if (!provider) {
      return NextResponse.json(
        { success: false, serverError: 'No active sandbox' },
        { status: 404 }
      )
    }

    const content = await provider.readFile(filePath)

    return NextResponse.json({
      success: true,
      content,
      filePath,
    })
  } catch (error) {
    l.error({ key: 'sandbox_file:read_failed', error }, 'Failed to read sandbox file')
    return NextResponse.json(
      { success: false, serverError: 'Failed to read file' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await checkAuthenticated()

    const { sandboxId, filePath, content } = (await request.json()) as {
      sandboxId?: string
      filePath?: string
      content?: string
    }

    if (!filePath || content === undefined) {
      return NextResponse.json(
        { success: false, serverError: 'File path and content are required' },
        { status: 400 }
      )
    }

    /*
     * Write file to sandbox using server action
     * writeSandboxFileAction handles file writing and validation
     */
    const result = await writeSandboxFileAction({
      sandboxId,
      filePath,
      content,
    })

    return NextResponse.json(result)
  } catch (error) {
    l.error({ key: 'sandbox_file:write_failed', error }, 'Failed to write sandbox file')
    return NextResponse.json(
      { success: false, serverError: 'Failed to write file' },
      { status: 500 }
    )
  }
}
