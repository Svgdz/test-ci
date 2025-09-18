import { NextRequest, NextResponse } from 'next/server'
import { checkAuthenticated } from '@/lib/utils/server'
import { getSandboxFiles } from '@/server/sandbox/get-sandbox-files'
import { l } from '@/lib/clients/logger'

export async function GET(request: NextRequest) {
  try {
    await checkAuthenticated()

    const { searchParams } = new URL(request.url)
    const sandboxId = searchParams.get('sandboxId')

    /*
     * Get sandbox files using server action
     * getSandboxFiles handles file retrieval and manifest generation
     */
    const result = await getSandboxFiles(sandboxId ? { sandboxId } : {})

    if (result.serverError) {
      return NextResponse.json({ success: false, serverError: result.serverError }, { status: 500 })
    }

    if (result.data) {
      return NextResponse.json(result.data)
    } else {
      return NextResponse.json(
        { success: false, serverError: 'No data returned from server action' },
        { status: 500 }
      )
    }
  } catch (error) {
    l.error({ key: 'sandbox_files:failed', error }, 'Failed to get sandbox files')
    return NextResponse.json(
      { success: false, serverError: 'Failed to get sandbox files' },
      { status: 500 }
    )
  }
}
