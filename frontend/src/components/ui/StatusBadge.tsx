// components/ui/StatusBadge.tsx
import { STATUS_COLOR } from '../../utils/formatters'

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${STATUS_COLOR[status] ?? 'bg-slate-500/20 text-slate-400'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
