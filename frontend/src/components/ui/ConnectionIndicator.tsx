// components/ui/ConnectionIndicator.tsx
import type { EventSocketStatus } from '../../services/eventSocket'

const CONFIG: Record<EventSocketStatus, { dot: string; label: string; pulse: boolean }> = {
  CONNECTED: { dot: 'bg-green-500', label: 'LIVE', pulse: true },
  CONNECTING: { dot: 'bg-amber-400', label: 'CONNECTING', pulse: false },
  RECONNECTING: { dot: 'bg-amber-400', label: 'RECONNECTING', pulse: false },
  DISCONNECTED: { dot: 'bg-slate-500', label: 'OFFLINE', pulse: false },
  FAILED: { dot: 'bg-red-500', label: 'FAILED', pulse: false },
}

export function ConnectionIndicator({ status }: { status: EventSocketStatus }) {
  const cfg = CONFIG[status] ?? CONFIG.DISCONNECTED
  return (
    <div className="flex items-center gap-1.5" role="status" aria-label={`Connection: ${cfg.label}`}>
      <span className="relative flex h-2 w-2">
        {cfg.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-60`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dot}`} />
      </span>
      <span className="text-xs text-slate-400 font-mono">{cfg.label}</span>
    </div>
  )
}
