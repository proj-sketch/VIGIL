// services/voiceSocket.ts — Voice WebSocket client
// Protocol from inspection of backend/app/api/ws/voice.py
import type { AnyVoiceMessage } from '../types/api'

export type VoiceSocketStatus = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ENDED' | 'ERROR'

type MessageHandler = (msg: AnyVoiceMessage) => void
type AudioHandler = (audio: ArrayBuffer) => void
type StatusHandler = (status: VoiceSocketStatus) => void

const WS_BASE = import.meta.env.VITE_WS_BASE_URL || 'ws://127.0.0.1:8000'

export class VoiceSocketService {
  private ws: WebSocket | null = null
  private status: VoiceSocketStatus = 'IDLE'
  private pingTimer: ReturnType<typeof setInterval> | null = null

  private messageHandlers = new Set<MessageHandler>()
  private audioHandlers = new Set<AudioHandler>()
  private statusHandlers = new Set<StatusHandler>()

  connect(sessionToken: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${WS_BASE}/ws/voice/${sessionToken}`
      this._setStatus('CONNECTING')

      try {
        this.ws = new WebSocket(url)
        this.ws.binaryType = 'arraybuffer'
      } catch (err) {
        this._setStatus('ERROR')
        reject(err)
        return
      }

      this.ws.onopen = () => {
        // Wait for session.ready before resolving
      }

      this.ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data) as AnyVoiceMessage
            if (msg.type === 'ping') {
              this.ws?.send(JSON.stringify({ type: 'pong' }))
              return
            }
            if (msg.type === 'session.ready') {
              this._setStatus('LISTENING')
              this._startPing()
              resolve()
            }
            if (msg.type === 'session.ended') {
              this._setStatus('ENDED')
              this._cleanup()
            }
            if (msg.type === 'error') {
              this._setStatus('ERROR')
            }
            if (msg.type === 'transcript') {
              // If agent speaking, mark speaking; user transcript → mark listening
              const t = msg as { type: 'transcript'; role: string; text: string }
              if (t.role === 'AGENT' || t.role === 'assistant') {
                this._setStatus('SPEAKING')
              } else {
                this._setStatus('LISTENING')
              }
            }
            this.messageHandlers.forEach(h => h(msg))
          } catch {
            // ignore
          }
        } else if (event.data instanceof ArrayBuffer) {
          // Binary audio from server TTS
          this._setStatus('SPEAKING')
          this.audioHandlers.forEach(h => h(event.data as ArrayBuffer))
        }
      }

      this.ws.onerror = () => {
        this._setStatus('ERROR')
        reject(new Error('Voice WebSocket error'))
      }

      this.ws.onclose = (ev) => {
        this._cleanup()
        if (this.status !== 'ENDED') {
          this._setStatus(ev.wasClean ? 'ENDED' : 'ERROR')
        }
      }
    })
  }

  /** Send raw PCM audio bytes to the backend (legacy — now unused with Web Speech API) */
  sendAudio(buffer: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buffer)
    }
  }

  /** Send transcribed text from Web Speech API to the Gemini backend agent */
  sendUserText(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'user_text', text }))
    }
  }

  endSession() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'end_session' }))
    }
    this._setStatus('ENDED')
    this._cleanup()
  }

  setStatus(s: VoiceSocketStatus) {
    this._setStatus(s)
  }

  private _startPing() {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'pong' }))
      }
    }, 20_000)
  }

  private _cleanup() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
    this.ws?.close()
    this.ws = null
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onAudio(handler: AudioHandler) {
    this.audioHandlers.add(handler)
    return () => this.audioHandlers.delete(handler)
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  getStatus() { return this.status }

  private _setStatus(s: VoiceSocketStatus) {
    this.status = s
    this.statusHandlers.forEach(h => h(s))
  }

  destroy() {
    this._cleanup()
    this.messageHandlers.clear()
    this.audioHandlers.clear()
    this.statusHandlers.clear()
  }
}
