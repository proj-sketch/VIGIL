import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, ShieldAlert, Send } from 'lucide-react'
import { useVoiceStore } from '../../stores/voiceStore'
import { useVoiceSession } from '../../hooks/useVoiceSession'
import { VoiceOrb } from '../../components/voice/VoiceOrb'
import { TranscriptViewer } from '../../components/voice/TranscriptViewer'

export default function VoiceSessionPage() {
  const navigate = useNavigate()
  const { endSession, sendText } = useVoiceSession()
  const store = useVoiceStore()
  const { connectionStatus, volumeLevel, transcript, agentMessage, error, incidentId } = store
  const hasRedirected = useRef(false)
  const [typedMessage, setTypedMessage] = useState('')

  // Redirect away if no session
  useEffect(() => {
    if (!store.sessionToken && connectionStatus === 'IDLE') {
      navigate('/emergency', { replace: true })
    }
  }, [store.sessionToken, connectionStatus, navigate])

  // Navigate to status page after session ends with an incident
  useEffect(() => {
    if (connectionStatus === 'ENDED' && incidentId && !hasRedirected.current) {
      hasRedirected.current = true
      setTimeout(() => navigate(`/emergency/status/${incidentId}`), 1500)
    }
  }, [connectionStatus, incidentId, navigate])

  const handleEnd = useCallback(() => {
    endSession()
  }, [endSession])

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault()
    if (!typedMessage.trim()) return
    sendText(typedMessage)
    setTypedMessage('')
  }

  const isActive = connectionStatus !== 'ENDED' && connectionStatus !== 'ERROR'

  return (
    <div className="min-h-screen bg-[#080d18] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-500" aria-hidden="true" />
          <span className="text-white font-bold tracking-tight">RAPID HELP</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {connectionStatus === 'LISTENING' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              connectionStatus === 'LISTENING' ? 'bg-red-500' :
              connectionStatus === 'CONNECTED' || connectionStatus === 'SPEAKING' ? 'bg-green-500' :
              connectionStatus === 'ENDED' ? 'bg-slate-500' :
              connectionStatus === 'ERROR' ? 'bg-red-800' :
              'bg-amber-500'
            }`} />
          </span>
          <span className="text-xs text-slate-400 font-mono">{connectionStatus}</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-between px-6 pb-8 gap-6">
        {/* Agent message area */}
        <div className="w-full max-w-md pt-4 min-h-16">
          {agentMessage && (
            <div className="animate-fade-in-up bg-blue-950/50 border border-blue-800/30 rounded-2xl px-5 py-4">
              <p className="text-[10px] font-bold tracking-widest text-blue-400 mb-1.5 uppercase">Rapid Help</p>
              <p className="text-white text-sm leading-relaxed">{agentMessage}</p>
            </div>
          )}
          {!agentMessage && connectionStatus === 'LISTENING' && (
            <div className="animate-fade-in-up text-center">
              <p className="text-slate-400 text-sm italic">Listening — speak naturally…</p>
            </div>
          )}
        </div>

        {/* Voice orb */}
        <VoiceOrb
          status={connectionStatus}
          volumeLevel={volumeLevel}
        />

        {/* Transcript */}
        <TranscriptViewer transcript={transcript} />

        {/* Error */}
        {error && (
          <div className="max-w-sm w-full bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 text-center" role="alert">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {connectionStatus === 'ENDED' && (
          <div className="animate-fade-in-up text-center">
            <p className="text-green-400 text-sm font-medium">Session complete</p>
            {incidentId && (
              <p className="text-slate-400 text-xs mt-1">Redirecting to your incident status…</p>
            )}
          </div>
        )}
      </main>

      {/* Actions: Fallback text chat + End session */}
      {isActive && (
        <div className="sticky bottom-0 px-6 pb-6 pt-3 bg-gradient-to-t from-[#080d18] via-[#080d18]/95 to-transparent flex flex-col gap-3">
          <form onSubmit={handleSendText} className="max-w-md w-full mx-auto flex items-center gap-2">
            <input
              type="text"
              value={typedMessage}
              onChange={(e) => setTypedMessage(e.target.value)}
              placeholder="Or type here if unable to speak..."
              className="flex-1 bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/40"
            />
            <button
              type="submit"
              disabled={!typedMessage.trim()}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 rounded-xl text-white text-sm font-semibold flex items-center gap-1.5 transition"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Send</span>
            </button>
          </form>

          <div className="max-w-md w-full mx-auto">
            <button
              onClick={handleEnd}
              className="
                w-full py-3 rounded-xl
                bg-slate-900/80 hover:bg-slate-800
                border border-slate-700/60 hover:border-red-500/40
                text-slate-400 hover:text-red-400
                flex items-center justify-center gap-2
                font-medium text-xs tracking-wide uppercase transition-all duration-200
                focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50
              "
              aria-label="End emergency session"
            >
              <Phone className="w-3.5 h-3.5" aria-hidden="true" />
              End Emergency Session
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
