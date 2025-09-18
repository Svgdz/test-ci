import { map } from 'nanostores'
import type { UIMessage } from 'ai'

export interface ChatState {
  started: boolean
  aborted: boolean
  showChat: boolean
  currentSessionId?: string
  currentProjectId?: string
  messages: UIMessage[]
  isStreaming: boolean
  error?: string
}

export const chatStore = map<ChatState>({
  started: false,
  aborted: false,
  showChat: true,
  messages: [],
  isStreaming: false,
})

// Helper functions for chat store
export const chatActions = {
  startSession: (sessionId: string, projectId: string) => {
    chatStore.setKey('started', true)
    chatStore.setKey('currentSessionId', sessionId)
    chatStore.setKey('currentProjectId', projectId)
    chatStore.setKey('error', undefined)
  },

  addMessage: (message: UIMessage) => {
    const currentMessages = chatStore.get().messages
    chatStore.setKey('messages', [...currentMessages, message])
  },

  updateMessages: (messages: UIMessage[]) => {
    chatStore.setKey('messages', messages)
  },

  setStreaming: (streaming: boolean) => {
    chatStore.setKey('isStreaming', streaming)
  },

  setError: (error: string) => {
    chatStore.setKey('error', error)
    chatStore.setKey('isStreaming', false)
  },

  abort: () => {
    chatStore.setKey('aborted', true)
    chatStore.setKey('isStreaming', false)
  },

  reset: () => {
    chatStore.set({
      started: false,
      aborted: false,
      showChat: true,
      messages: [],
      isStreaming: false,
    })
  },

  toggleChat: () => {
    const current = chatStore.get().showChat
    chatStore.setKey('showChat', !current)
  },
}
