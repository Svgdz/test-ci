import { NextRequest, NextResponse } from 'next/server'
import { checkAuthenticated } from '@/lib/utils/server'
import { getChatHistory } from '@/server/projects/chat-actions'
import { l } from '@/lib/clients/logger'

export async function GET(request: NextRequest) {
  try {
    const session = await checkAuthenticated()

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Project ID is required',
        },
        { status: 400 }
      )
    }

    /*
     * Get chat history using server action
     * getChatHistory handles its own logging and error handling
     */
    const result = await getChatHistory({ projectId })

    if (result.serverError || result.validationErrors) {
      return NextResponse.json(
        {
          success: false,
          error: result.serverError || 'Failed to load chat history',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      messages: result.data || [],
    })
  } catch (error) {
    l.error(
      {
        key: 'chat_history_api:error',
        error,
      },
      'Chat history request failed'
    )

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
