// components/voice/VoiceOrb.tsx
import type { VoiceSocketStatus } from '../../services/voiceSocket'

interface Props {
  status: VoiceSocketStatus
  volumeLevel: number // 0..1
  onClick?: () => void
}

const STATUS_LABEL: Record<VoiceSocketStatus, string> = {
  IDLE: 'Ready',
  CONNECTING: 'Connecting...',
  CONNECTED: 'Connected',
  LISTENING: 'Listening...',
  PROCESSING: 'Processing...',
  SPEAKING: 'Speaking...',
  ENDED: 'Session ended',
  ERROR: 'Connection lost',
}

const STATUS_COLOR: Record<VoiceSocketStatus, string> = {
  IDLE: 'from-slate-700 to-slate-800',
  CONNECTING: 'from-amber-600 to-amber-800',
  CONNECTED: 'from-blue-600 to-blue-800',
  LISTENING: 'from-red-500 to-rose-700',
  PROCESSING: 'from-purple-600 to-purple-800',
  SPEAKING: 'from-blue-500 to-indigo-700',
  ENDED: 'from-slate-600 to-slate-800',
  ERROR: 'from-red-800 to-red-900',
}

export function VoiceOrb({ status, volumeLevel, onClick }: Props) {
  const isListening = status === 'LISTENING'
  const isConnecting = status === 'CONNECTING'
  const hasError = status === 'ERROR'
  const isEnded = status === 'ENDED'
  const scale = 1 + volumeLevel * 0.15

  return (
    <div className="flex flex-col items-center gap-6 select-none">
      {/* Orb container */}
      <div className="relative flex items-center justify-center w-48 h-48">
        {/* Outer pulse rings — only when listening */}
        {isListening && (
          <>
            <span
              className="absolute inset-0 rounded-full bg-red-500 opacity-20 animate-pulse-ring"
              aria-hidden="true"
            />
            <span
              className="absolute inset-0 rounded-full bg-red-500 opacity-10 animate-pulse-ring-2"
              aria-hidden="true"
            />
          </>
        )}

        {/* Orb button */}
        <button
          onClick={onClick}
          disabled={isEnded || hasError}
          className={`
            relative z-10 w-36 h-36 rounded-full bg-gradient-to-br ${STATUS_COLOR[status]}
            flex items-center justify-center cursor-pointer transition-all duration-200
            focus:outline-none focus-visible:ring-4 focus-visible:ring-red-400/50
            ${isListening ? 'animate-glow-pulse shadow-[0_0_40px_rgba(239,68,68,0.4)]' : 'shadow-[0_8px_32px_rgba(0,0,0,0.4)]'}
            ${!isEnded && !hasError ? 'hover:scale-105' : 'opacity-60 cursor-not-allowed'}
          `}
          style={{ transform: isListening ? `scale(${scale})` : undefined }}
          aria-label={`Voice orb — ${STATUS_LABEL[status]}`}
        >
          <MicIcon status={status} />
        </button>
      </div>

      {/* Status label */}
      <div className="flex flex-col items-center gap-1.5">
        <span className={`flex items-center gap-2 text-sm font-medium ${hasError ? 'text-red-400' : 'text-slate-300'}`}>
          {isListening && <span className="w-2 h-2 rounded-full bg-red-500 animate-blink" aria-hidden="true" />}
          {STATUS_LABEL[status]}
        </span>
        {isListening && <AudioWaveform volumeLevel={volumeLevel} />}
      </div>
    </div>
  )
}

function MicIcon({ status }: { status: VoiceSocketStatus }) {
  if (status === 'SPEAKING') {
    return (
      <svg className="w-14 h-14 text-white opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072M12 6v12M9.172 9.172a4 4 0 000 5.656" />
      </svg>
    )
  }
  if (status === 'ERROR') {
    return (
      <svg className="w-12 h-12 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    )
  }
  return (
    <svg className="w-14 h-14 text-white opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  )
}

function AudioWaveform({ volumeLevel }: { volumeLevel: number }) {
  const bars = 9
  return (
    <div className="flex items-end gap-0.5 h-5" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        const delay = (i * 0.1).toFixed(1)
        const heightFraction = Math.max(0.2, Math.sin(((i / bars) * Math.PI)) * volumeLevel + 0.2)
        return (
          <div
            key={i}
            className="w-1 bg-red-400 rounded-full animate-wave origin-bottom"
            style={{
              height: `${(heightFraction * 20).toFixed(0)}px`,
              animationDelay: `${delay}s`,
              opacity: 0.6 + volumeLevel * 0.4,
            }}
          />
        )
      })}
    </div>
  )
}
