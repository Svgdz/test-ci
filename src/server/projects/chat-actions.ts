import 'server-cli-only'

import { authActionClient } from '@/lib/clients/action'
import { l } from '@/lib/clients/logger'
import { sanitizeText } from '@/lib/utils/server'
import type { Database } from '@/types/database.types'
import { ChatMessageInputSchema, GetChatHistorySchema, SaveChatMessagesSchema } from './types'
import type { z } from 'zod'

export type ChatMessageInput = z.infer<typeof ChatMessageInputSchema>

export const getChatHistory = authActionClient
  .schema(GetChatHistorySchema)
  .metadata({ actionName: 'getChatHistory' })
  .action(async ({ parsedInput, ctx }) => {
    const { supabase, user } = ctx

    const { data: rows, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('project_id', parsedInput.projectId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      l.error({ key: 'chat_actions:get_history_error', error, projectId: parsedInput.projectId })
      throw error
    }

    const messages = (rows ?? []) as Database['public']['Tables']['chat_messages']['Row'][]

    return messages.map((msg) => ({
      id: msg.id,
      role: (msg.role || 'assistant') as 'user' | 'assistant' | 'system',
      parts: [{ type: 'text' as const, text: msg.content || '' }],
      timestamp: new Date(msg.created_at).toISOString(),
    }))
  })

export const saveChatMessages = authActionClient
  .schema(SaveChatMessagesSchema)
  .metadata({ actionName: 'saveChatMessages' })
  .action(async ({ parsedInput, ctx }) => {
    const { supabase, user } = ctx

    const validMessages = parsedInput.messages.filter((msg) => {
      const content = msg.parts?.[0]?.text || msg.content || ''
      return sanitizeText(content).length > 0
    })

    if (validMessages.length === 0) {
      return { inserted: 0 }
    }

    const messagesToSave: Database['public']['Tables']['chat_messages']['Insert'][] =
      validMessages.map((msg) => ({
        project_id: parsedInput.projectId,
        user_id: user.id,
        role: msg.role,
        content: sanitizeText(msg.parts?.[0]?.text || msg.content || ''),
      }))

    const { error } = await supabase.from('chat_messages').insert(messagesToSave).select('*')

    if (error) {
      l.error({
        key: 'chat_actions:save_history_error',
        error,
        projectId: parsedInput.projectId,
        messageCount: messagesToSave.length,
      })
      throw error
    }

    return { inserted: messagesToSave.length }
  })
