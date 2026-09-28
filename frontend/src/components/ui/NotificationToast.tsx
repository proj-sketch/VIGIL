// components/ui/NotificationToast.tsx
import { useEffect } from 'react'
import { X, AlertTriangle, Info, Zap } from 'lucide-react'
import type { Notification } from '../../stores/missionControlStore'

interface Props {
  notifications: Notification[]
  onDismiss: (id: string) => void
}

const ICON = {
  critical: <Zap className="w-4 h-4 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
  info: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
}

const BORDER = {
  critical: 'border-l-2 border-red-500',
  warning: 'border-l-2 border-amber-500',
  info: 'border-l-2 border-blue-500',
}

export function NotificationToast({ notifications, onDismiss }: Props) {
  const unread = notifications.filter(n => !n.read).slice(0, 5)
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {unread.map(n => (
        <div
          key={n.id}
          className={`animate-slide-in-right bg-[#141c33] ${BORDER[n.level]} rounded-lg px-4 py-3 shadow-2xl flex items-start gap-3 pointer-events-auto`}
        >
          {ICON[n.level]}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{n.title}</p>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
          </div>
          <button
            onClick={() => onDismiss(n.id)}
            className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

// Auto-dismiss hook
export function useAutoDismiss(
  notifications: Notification[],
  dismiss: (id: string) => void,
  ms = 6000
) {
  useEffect(() => {
    const unread = notifications.filter(n => !n.read)
    if (unread.length === 0) return
    const timer = setTimeout(() => {
      dismiss(unread[0].id)
    }, ms)
    return () => clearTimeout(timer)
  }, [notifications, dismiss, ms])
}
