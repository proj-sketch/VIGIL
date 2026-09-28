// pages/citizen/EmergencyPage.tsx
import { useState } from 'react'
import { Mic, MapPin, ShieldAlert } from 'lucide-react'
import { useVoiceSession } from '../../hooks/useVoiceSession'
import { useVoiceStore } from '../../stores/voiceStore'

export default function EmergencyPage() {
  const { startSession } = useVoiceSession()
  const { error, connectionStatus } = useVoiceStore()
  const [starting, setStarting] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)

  const handleStart = async () => {
    setStarting(true)
    setMicError(null)
    try {
      // Check mic permission
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicError('Microphone not supported in this browser.')
        setStarting(false)
        return
      }
      await startSession()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start'
      setMicError(msg.includes('Permission') || msg.includes('NotAllowed')
        ? 'Microphone permission is required to use Rapid Help.'
        : msg
      )
      setStarting(false)
    }
  }

  const isConnecting = connectionStatus === 'CONNECTING' || starting

  return (
    <div className="min-h-screen bg-[#080d18] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-500" aria-hidden="true" />
          <span className="text-white font-bold text-lg tracking-tight">RAPID HELP</span>
        </div>
        <span className="text-xs text-slate-500 font-mono">EMERGENCY RESPONSE</span>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        {/* Hero */}
        <div className="text-center mb-12 max-w-sm mx-auto animate-fade-in-up">
          <h1 className="text-4xl font-black text-white leading-tight mb-4">
            Get help.
            <br />
            <span className="text-red-400">Just talk.</span>
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            Tell us what happened. We'll handle the rest.
          </p>
        </div>

        {/* CTA button */}
        <div className="relative flex items-center justify-center mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {/* Outer rings */}
          {!isConnecting && (
            <>
              <span className="absolute w-56 h-56 rounded-full bg-red-500/5 border border-red-500/10" aria-hidden="true" />
              <span className="absolute w-44 h-44 rounded-full bg-red-500/8 border border-red-500/15" aria-hidden="true" />
            </>
          )}
          {isConnecting && (
            <>
              <span className="absolute w-56 h-56 rounded-full bg-red-500/10 animate-pulse-ring" aria-hidden="true" />
              <span className="absolute w-44 h-44 rounded-full bg-red-500/15 animate-pulse-ring-2" aria-hidden="true" />
            </>
          )}

          <button
            onClick={handleStart}
            disabled={isConnecting}
            className="
              relative z-10 w-36 h-36 rounded-full
              bg-gradient-to-br from-red-500 to-rose-700
              shadow-[0_0_40px_rgba(239,68,68,0.35),0_8px_32px_rgba(0,0,0,0.4)]
              flex flex-col items-center justify-center gap-2
              text-white font-bold text-sm
              transition-all duration-200
              hover:scale-105 hover:shadow-[0_0_60px_rgba(239,68,68,0.5)]
              active:scale-95
              focus:outline-none focus-visible:ring-4 focus-visible:ring-red-400/50
              disabled:opacity-70 disabled:cursor-wait disabled:scale-100
            "
            aria-label="Start emergency call — click to begin speaking"
          >
            {isConnecting ? (
              <>
                <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs">Connecting</span>
              </>
            ) : (
              <>
                <Mic className="w-10 h-10" aria-hidden="true" />
                <span className="text-xs tracking-wide">CALL</span>
              </>
            )}
          </button>
        </div>

        {/* Sub-label */}
        <p className="text-slate-500 text-sm text-center animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          🎙 Start Emergency Call
        </p>

        {/* Error state */}
        {(micError || error) && (
          <div
            className="mt-6 max-w-sm w-full bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 text-center animate-fade-in-up"
            role="alert"
          >
            <p className="text-red-300 text-sm font-medium">{micError ?? error}</p>
            {(micError?.includes('permission') || micError?.includes('Permission')) && (
              <p className="text-red-400/70 text-xs mt-1">
                Please allow microphone access in your browser settings.
              </p>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 pb-8 text-center">
        <div className="flex items-center justify-center gap-2 text-slate-600 text-xs">
          <MapPin className="w-3 h-3" aria-hidden="true" />
          <span>Your location may be shared to help responders find you</span>
        </div>
      </footer>
    </div>
  )
}
