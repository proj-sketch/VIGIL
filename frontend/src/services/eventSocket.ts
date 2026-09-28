// services/eventSocket.ts — Shared Mission Control realtime WebSocket
// ONE shared connection for the entire app. DO NOT create multiple instances.
import type { EventWSMessage } from '../types/api'

export type EventSocketStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'FAILED'

type EventHandler = (msg: EventWSMessage) => void
type StatusHandler = (status: EventSocketStatus) => void

const WS_BASE = import.meta.env.VITE_WS_BASE_URL || 'ws://127.0.0.1:8000'
const MAX_RETRIES = 8
const BASE_DELAY_MS = 1000

class EventSocketService {
  private ws: WebSocket | null = null
  private status: EventSocketStatus = 'DISCONNECTED'
  private retries = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private destroyed = false

  private eventHandlers = new Set<EventHandler>()
  private statusHandlers = new Set<StatusHandler>()
  private subscribedChannels = new Set<string>(['incidents:all'])

  connect(initialChannel = 'incidents:all') {
    if (this.destroyed) return
    this.subscribedChannels.add(initialChannel)
    this._connect()
  }

  private _connect() {
    if (this.destroyed) return
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return

    this._setStatus('CONNECTING')
    const url = `${WS_BASE}/ws/events?channel=incidents:all`
    
    try {
      this.ws = new WebSocket(url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.retries = 0
      this._setStatus('CONNECTED')
      this._startPing()
      // Re-subscribe to all channels
      for (const ch of this.subscribedChannels) {
        if (ch !== 'incidents:all') {
          this._send({ type: 'subscribe', channel: ch })
        }
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as EventWSMessage
        if (msg.type === 'ping') {
          this._send({ type: 'pong' } as unknown as EventWSMessage)
          return
        }
        if (msg.type === 'pong' || msg.type === 'connected' || msg.type === 'subscribed') return
        this.eventHandlers.forEach(h => h(msg))
      } catch {
        // ignore malformed
      }
    }

    this.ws.onerror = () => {
      this._setStatus('DISCONNECTED')
    }

    this.ws.onclose = () => {
      this._stopPing()
      if (!this.destroyed) {
        this._scheduleReconnect()
      }
    }
  }

  private _scheduleReconnect() {
    if (this.destroyed) return
    if (this.retries >= MAX_RETRIES) {
      this._setStatus('FAILED')
      return
    }
    this._setStatus('RECONNECTING')
    const delay = Math.min(BASE_DELAY_MS * 2 ** this.retries, 30_000)
    this.retries++
    this.retryTimer = setTimeout(() => this._connect(), delay)
  }

  private _startPing() {
    this._stopPing()
    this.pingTimer = setInterval(() => {
      this._send({ type: 'ping' } as unknown as EventWSMessage)
    }, 25_000)
  }

  private _stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
  }

  private _send(msg: EventWSMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private _setStatus(s: EventSocketStatus) {
    this.status = s
    this.statusHandlers.forEach(h => h(s))
  }

  subscribe(channel: string) {
    this.subscribedChannels.add(channel)
    this._send({ type: 'subscribe', channel } as unknown as EventWSMessage)
  }

  onEvent(handler: EventHandler) {
    this.eventHandlers.add(handler)
    return () => this.eventHandlers.delete(handler)
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler)
    handler(this.status) // emit current status immediately
    return () => this.statusHandlers.delete(handler)
  }

  getStatus() { return this.status }

  destroy() {
    this.destroyed = true
    this._stopPing()
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.ws?.close()
    this.ws = null
    this.eventHandlers.clear()
    this.statusHandlers.clear()
  }
}

// Singleton — one per app
export const eventSocket = new EventSocketService()
