// components/ui/SeverityBadge.tsx
import { SEVERITY_COLOR } from '../../utils/formatters'

export function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity) return <span className="text-slate-500 text-xs">—</span>
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold tracking-wide ${SEVERITY_COLOR[severity] ?? 'bg-slate-500/20 text-slate-400'}`}>
      {severity}
    </span>
  )
}
