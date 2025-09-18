import { NextRequest, NextResponse } from 'next/server'
import { checkAuthenticated } from '@/lib/utils/server'
import { getSandboxStatusAction } from '@/server/sandbox/sandbox-status'
import { l } from '@/lib/clients/logger'

export async function GET(_request: NextRequest) {
  try {
    await checkAuthenticated()

    /*
     * Get sandbox status using server action
     * getSandboxStatusAction handles sandbox status retrieval
     */
    const result = await getSandboxStatusAction()
    return NextResponse.json(result)
  } catch (error) {
    l.error({ key: 'sandbox_status:failed', error }, 'Failed to get sandbox status')
    return NextResponse.json(
      { success: false, serverError: 'Failed to get sandbox status' },
      { status: 500 }
    )
  }
}
