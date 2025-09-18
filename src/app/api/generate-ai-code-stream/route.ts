import { NextRequest, NextResponse } from 'next/server'
import { applyAiCodeStream } from '@/server/agent/agent-code-stream'
import { checkAuthenticated } from '@/lib/utils/server'
import { l } from '@/lib/clients/logger'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await checkAuthenticated()

    const {
      prompt,
      model = 'anthropic/claude-sonnet-4-20250514',
      context,
      isEdit = false,
    } = (await request.json()) as {
      prompt?: string
      model?: string
      context?: {
        sandboxId?: string
        currentFiles?: Record<string, unknown>
        conversationContext?: { currentProject?: unknown }
      }
      isEdit?: boolean
    }

    l.info(
      {
        key: 'generate_ai_code_stream:start',
        prompt: typeof prompt === 'string' ? prompt.substring(0, 100) : '',
        isEdit,
        sandboxId: context?.sandboxId,
        currentFiles: context?.currentFiles ? Object.keys(context.currentFiles).length : 0,
        userId: session.user.id,
      },
      'Starting AI code generation stream'
    )

    if (!prompt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Prompt is required',
        },
        { status: 400 }
      )
    }

    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    /*
     * Function to send progress updates with flushing
     */
    const sendProgress = async (data: Record<string, unknown>) => {
      const message = `data: ${JSON.stringify(data)}\n\n`
      try {
        await writer.write(encoder.encode(message))
        if (data.type === 'stream' || data.type === 'conversation') {
          await writer.write(encoder.encode(': keepalive\n\n'))
        }
      } catch (error) {
        l.error({ key: 'generate_ai_code_stream:write_error', error }, 'Error writing to stream')
      }
    }

    void (async () => {
      try {
        await sendProgress({ type: 'status', message: 'Initializing AI...' })

        const result = await applyAiCodeStream(
          {
            prompt,
            model,
            context: {
              ...context,
              conversationContext: {
                ...context?.conversationContext,
                currentProject: context?.conversationContext?.currentProject as string | undefined,
              },
            },
            isEdit,
            sandboxId: context?.sandboxId,
          },
          async (progressEvent) => {
            switch (progressEvent.type) {
              case 'start':
                await sendProgress({
                  type: 'status',
                  message: progressEvent.message,
                  totalSteps: progressEvent.totalSteps,
                })
                break
              case 'step':
                await sendProgress({
                  type: 'status',
                  message: progressEvent.message,
                  step: progressEvent.step,
                  packages: progressEvent.packages,
                })
                break
              case 'file-progress':
                await sendProgress({
                  type: 'file-progress',
                  current: progressEvent.current,
                  total: progressEvent.total,
                  fileName: progressEvent.fileName,
                  action: progressEvent.action,
                })
                break
              case 'file-complete':
                await sendProgress({
                  type: 'file-complete',
                  fileName: progressEvent.fileName,
                  action: progressEvent.action,
                })
                break
              case 'package-progress':
                await sendProgress({
                  type: 'package',
                  message: progressEvent.message,
                  installedPackages: progressEvent.installedPackages,
                })
                break
              case 'command-progress':
                await sendProgress({
                  type: 'command-progress',
                  current: progressEvent.current,
                  total: progressEvent.total,
                  command: progressEvent.command,
                  action: progressEvent.action,
                })
                break
              case 'command-output':
                await sendProgress({
                  type: 'command-output',
                  command: progressEvent.command,
                  output: progressEvent.output,
                  stream: progressEvent.stream,
                })
                break
              case 'command-complete':
                await sendProgress({
                  type: 'command-complete',
                  command: progressEvent.command,
                  exitCode: progressEvent.exitCode,
                  success: progressEvent.success,
                })
                break
              case 'warning':
                await sendProgress({
                  type: 'warning',
                  message: progressEvent.message,
                })
                break
              case 'error':
                await sendProgress({
                  type: 'error',
                  error: progressEvent.error,
                })
                break
              case 'complete':
                await sendProgress({
                  type: 'complete',
                  results: progressEvent.results,
                  explanation: progressEvent.explanation,
                  structure: progressEvent.structure,
                  message: progressEvent.message,
                  files:
                    progressEvent.results.filesCreated.length +
                    progressEvent.results.filesUpdated.length,
                  model,
                  packagesToInstall:
                    progressEvent.results.packagesInstalled.length > 0
                      ? progressEvent.results.packagesInstalled
                      : undefined,
                })
                break
            }
          }
        )

        l.info(
          {
            key: 'generate_ai_code_stream:success',
            filesCreated: result.results.filesCreated.length,
            filesUpdated: result.results.filesUpdated.length,
            packagesInstalled: result.results.packagesInstalled.length,
            success: result.success,
            userId: session.user.id,
          },
          'AI code generation completed'
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        l.error(
          {
            key: 'generate_ai_code_stream:error',
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            userId: session.user.id,
          },
          'AI code generation failed'
        )

        try {
          await sendProgress({
            type: 'error',
            error: errorMessage,
          })
        } catch (streamError) {
          l.error(
            {
              key: 'generate_ai_code_stream:stream_error',
              error: streamError,
            },
            'Failed to send error to stream'
          )
        }
      } finally {
        try {
          await writer.close()
        } catch (closeError) {
          l.error(
            {
              key: 'generate_ai_code_stream:close_error',
              error: closeError,
            },
            'Failed to close stream writer'
          )
        }
      }
    })()

    /*
     * Return the stream with proper headers for streaming support
     * CORS headers are handled globally in next.config.ts
     */
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'Content-Encoding': 'none',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    l.error(
      {
        key: 'generate_ai_code_stream:failed',
        error,
      },
      'Generate AI code stream request failed'
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
