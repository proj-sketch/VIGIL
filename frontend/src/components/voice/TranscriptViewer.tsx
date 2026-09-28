// components/voice/TranscriptViewer.tsx
import { useEffect, useRef } from 'react'
import type { TranscriptEntry } from '../../stores/voiceStore'

interface Props {
  transcript: TranscriptEntry[]
}

export function TranscriptViewer({ transcript }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript.length])

  if (transcript.length === 0) return null

  return (
    <div className="w-full max-w-md mx-auto max-h-64 overflow-y-auto space-y-3 px-1">
      {transcript.map((entry) => {
        const isCitizen = entry.role === 'CITIZEN' || entry.role === 'user'
        return (
          <div
            key={entry.id}
            className={`animate-fade-in-up flex flex-col gap-0.5 ${isCitizen ? 'items-end' : 'items-start'}`}
          >
            <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase px-1">
              {isCitizen ? 'You' : 'Rapid Help'}
            </span>
            <div
              className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                isCitizen
                  ? 'bg-slate-700/80 text-slate-200 rounded-br-sm'
                  : 'bg-blue-900/60 text-blue-100 rounded-bl-sm border border-blue-800/40'
              }`}
            >
              {entry.text}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
