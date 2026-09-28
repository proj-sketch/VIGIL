// hooks/useVoiceSession.ts — Voice session using Web Speech API + Gemini backend
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { voice } from '../services/api'
import { VoiceSocketService } from '../services/voiceSocket'
import { SpeechRecognitionService } from '../services/speechRecognition'
import { useVoiceStore } from '../stores/voiceStore'
import type { TranscriptMessage } from '../types/api'

// Shared module-level instances so all components (EmergencyPage, VoiceSessionPage) share the active session
let activeWs: VoiceSocketService | null = null
let activeSpeech: SpeechRecognitionService | null = null

export function useVoiceSession() {
  const navigate = useNavigate()
  const store = useVoiceStore()

  const startSession = useCallback(async () => {
    store.setError(null)
    store.setConnectionStatus('CONNECTING')

    try {
      // 1. Create session via REST
      const session = await voice.createSession({ role: 'CITIZEN' })
      store.setSession({
        sessionId: session.session_id,
        conversationId: session.conversation_id,
        sessionToken: session.session_token,
        wsUrl: session.ws_url,
        expiresAt: session.expires_at,
      })

      // 2. Check browser speech support
      const speech = new SpeechRecognitionService()
      if (!speech.isSupported()) {
        store.setError('Speech recognition is not supported. Please use Chrome or Edge browser.')
        store.setConnectionStatus('ERROR')
        return
      }
      activeSpeech = speech

      // 3. Create WS service instance
      const ws = new VoiceSocketService()
      activeWs = ws

      // 4. Wire status updates to store
      ws.onStatus((s) => store.setConnectionStatus(s))

      // 5. Wire transcript messages from backend
      ws.onMessage((msg) => {
        if (msg.type === 'transcript') {
          const t = msg as TranscriptMessage
          store.addTranscript(t)
          // Speak agent responses aloud
          if (t.role === 'AGENT' || t.role === 'agent' || t.role === 'assistant') {
            speech.speak(t.text)
            store.setConnectionStatus('SPEAKING')
            // After TTS estimate, go back to listening
            const wordCount = t.text.split(' ').length
            const estimatedMs = Math.max(2000, wordCount * 400)
            setTimeout(() => {
              if (activeWs) store.setConnectionStatus('LISTENING')
            }, estimatedMs)
          }
        }
        if (msg.type === 'session.ended') {
          speech.stop()
        }
      })

      // 6. Connect WS (resolves after session.ready)
      await ws.connect(session.session_token)

      // 7. Start Web Speech recognition
      await speech.start()

      // 8. Wire speech transcript → send to backend as user_text frame
      speech.onTranscript((text, isFinal) => {
        store.setVolumeLevel(0.6) // visual feedback
        if (isFinal && activeWs && text.length > 2) {
          activeWs.sendUserText(text)
          store.setConnectionStatus('PROCESSING')
        }
      })

      // 9. Wire volume level
      speech.onVolume((level) => store.setVolumeLevel(level))

      // 10. Navigate to voice session page
      navigate('/emergency/session')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start session'
      store.setError(message)
      store.setConnectionStatus('ERROR')
    }
  }, [store, navigate])

  const sendText = useCallback((text: string) => {
    if (activeWs && text.trim()) {
      activeWs.sendUserText(text.trim())
      store.setConnectionStatus('PROCESSING')
    }
  }, [store])

  const endSession = useCallback(() => {
    activeSpeech?.stop()
    window.speechSynthesis?.cancel()
    activeWs?.endSession()
    activeWs?.destroy()
    activeWs = null
    activeSpeech = null
    store.setConnectionStatus('ENDED')
  }, [store])

  return { startSession, endSession, sendText }
}
