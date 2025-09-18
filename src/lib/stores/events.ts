import { l as logger } from '@/lib/clients/logger'

export type StoreEventType =
  | 'file:created'
  | 'file:updated'
  | 'file:deleted'
  | 'file:selected'
  | 'files:refreshed'
  | 'sandbox:initialized'
  | 'sandbox:changed'
  | 'sandbox:error'
  | 'chat:message_added'
  | 'chat:session_changed'
  | 'editor:content_changed'
  | 'editor:file_saved'
  | 'action:started'
  | 'action:completed'
  | 'action:failed'

export interface StoreEvent<T = unknown> {
  type: StoreEventType
  payload: T
  timestamp: Date
  source?: string
}

export interface FileEvent {
  filePath: string
  content?: string
  oldContent?: string
}

export interface SandboxEvent {
  sandboxId: string
  error?: string
}

export interface ChatEvent {
  messageId: string
  sessionId?: string
}

export interface EditorEvent {
  filePath: string
  content: string
  unsaved?: boolean
}

export interface ActionEvent {
  actionId: string
  actionType: 'write' | 'run'
  error?: string
  result?: unknown
}

type EventListener<T = unknown> = (event: StoreEvent<T>) => void | Promise<void>

/**
 * Central event bus for store communication
 * Allows stores to communicate without tight coupling
 */
export class StoreEventBus {
  private static instance: StoreEventBus
  private listeners: Map<StoreEventType, Set<EventListener<unknown>>> = new Map()
  private eventHistory: StoreEvent[] = []
  private maxHistorySize = 100

  private constructor() {
    logger.info({ key: 'store_event_bus:initialized' }, 'StoreEventBus initialized')
  }

  static getInstance(): StoreEventBus {
    if (!StoreEventBus.instance) {
      StoreEventBus.instance = new StoreEventBus()
    }
    return StoreEventBus.instance
  }

  // Subscribe to events of a specific type
  on<T = unknown>(eventType: StoreEventType, listener: EventListener<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }

    const listeners = this.listeners.get(eventType)!
    listeners.add(listener as EventListener<unknown>)

    logger.debug(
      {
        key: 'store_event_bus:listener_added',
        event_type: eventType,
        listener_count: listeners.size,
      },
      `Added listener for ${eventType} (${listeners.size} total)`
    )

    // Return unsubscribe function
    return () => {
      listeners.delete(listener as EventListener<unknown>)
      if (listeners.size === 0) {
        this.listeners.delete(eventType)
      }
      logger.debug(
        { key: 'store_event_bus:listener_removed', event_type: eventType },
        `Removed listener for ${eventType}`
      )
    }
  }

  // Subscribe to multiple event types with the same listener
  onMany<T = unknown>(eventTypes: StoreEventType[], listener: EventListener<T>): () => void {
    const unsubscribers = eventTypes.map((type) => this.on(type, listener))

    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }

  //Emit an event to all listeners
  async emit<T = unknown>(eventType: StoreEventType, payload: T, source?: string): Promise<void> {
    const event: StoreEvent<T> = {
      type: eventType,
      payload,
      timestamp: new Date(),
      source,
    }

    // Add to history
    this.eventHistory.push(event)
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift()
    }

    const listeners = this.listeners.get(eventType)
    if (!listeners || listeners.size === 0) {
      logger.debug(
        { key: 'store_event_bus:no_listeners', event_type: eventType },
        `No listeners for ${eventType}`
      )
      return
    }

    logger.debug(
      {
        key: 'store_event_bus:emitting_event',
        event_type: eventType,
        listener_count: listeners.size,
      },
      `Emitting ${eventType} to ${listeners.size} listeners`
    )

    // Execute all listeners
    const promises = Array.from(listeners).map(async (listener) => {
      try {
        await listener(event)
      } catch (error) {
        logger.error(
          { key: 'store_event_bus:listener_error', event_type: eventType, error },
          'Error in event listener'
        )
      }
    })

    await Promise.allSettled(promises)
  }

  // Get recent event history
  getEventHistory(eventType?: StoreEventType, limit?: number): StoreEvent[] {
    let events = eventType
      ? this.eventHistory.filter((e) => e.type === eventType)
      : this.eventHistory

    if (limit) {
      events = events.slice(-limit)
    }

    return events
  }

  // Clear event history
  clearHistory(): void {
    this.eventHistory = []
    logger.debug({ key: 'store_event_bus:history_cleared' }, 'Event history cleared')
  }

  // Remove all listeners
  removeAllListeners(): void {
    this.listeners.clear()
    logger.debug({ key: 'store_event_bus:all_listeners_removed' }, 'All event listeners removed')
  }

  // Get listener count for debugging
  getListenerCount(eventType?: StoreEventType): number {
    if (eventType) {
      return this.listeners.get(eventType)?.size || 0
    }

    return Array.from(this.listeners.values()).reduce(
      (total, listeners) => total + listeners.size,
      0
    )
  }
}

// Export singleton instance
export const storeEventBus = StoreEventBus.getInstance()

// Convenience functions for common events
export const fileEvents = {
  created: (filePath: string, content: string, source?: string) =>
    storeEventBus.emit('file:created', { filePath, content }, source),

  updated: (filePath: string, content: string, oldContent: string, source?: string) =>
    storeEventBus.emit('file:updated', { filePath, content, oldContent }, source),

  deleted: (filePath: string, source?: string) =>
    storeEventBus.emit('file:deleted', { filePath }, source),

  selected: (filePath: string, source?: string) =>
    storeEventBus.emit('file:selected', { filePath }, source),

  refreshed: (source?: string) => storeEventBus.emit('files:refreshed', {}, source),

  sandboxChanged: (oldSandboxId: string, newSandboxId: string, source?: string) =>
    storeEventBus.emit('sandbox:changed', { oldSandboxId, newSandboxId }, source),
}

export const sandboxEvents = {
  initialized: (sandboxId: string, source?: string) =>
    storeEventBus.emit('sandbox:initialized', { sandboxId }, source),

  error: (sandboxId: string, error: string, source?: string) =>
    storeEventBus.emit('sandbox:error', { sandboxId, error }, source),
}

export const chatEvents = {
  messageAdded: (messageId: string, sessionId: string, source?: string) =>
    storeEventBus.emit('chat:message_added', { messageId, sessionId }, source),

  sessionChanged: (sessionId: string, source?: string) =>
    storeEventBus.emit('chat:session_changed', { sessionId }, source),
}

export const editorEvents = {
  contentChanged: (filePath: string, content: string, unsaved: boolean, source?: string) =>
    storeEventBus.emit('editor:content_changed', { filePath, content, unsaved }, source),

  fileSaved: (filePath: string, content: string, source?: string) =>
    storeEventBus.emit('editor:file_saved', { filePath, content }, source),
}

export const actionEvents = {
  started: (actionId: string, actionType: 'write' | 'run', source?: string) =>
    storeEventBus.emit('action:started', { actionId, actionType }, source),

  completed: (actionId: string, actionType: 'write' | 'run', result: unknown, source?: string) =>
    void storeEventBus.emit('action:completed', { actionId, actionType, result }, source),

  failed: (actionId: string, actionType: 'write' | 'run', error: string, source?: string) =>
    storeEventBus.emit('action:failed', { actionId, actionType, error }, source),
}
