// pages/operator/ActivityPage.tsx
import { Activity } from 'lucide-react'
import { useMissionControlStore } from '../../stores/missionControlStore'
import { timeAgo } from '../../utils/formatters'

export default function ActivityPage() {
  const { activity, connectionStatus } = useMissionControlStore()

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-xl font-bold">Activity Feed</h1>
          <p className="text-slate-500 text-sm">Realtime event log — {activity.length} events</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connectionStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} aria-hidden="true" />
          <span className="text-xs text-slate-500">{connectionStatus}</span>
        </div>
      </div>

      <div className="bg-[#141c33] border border-white/[0.06] rounded-2xl overflow-hidden">
        {activity.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <Activity className="w-8 h-8 text-slate-700" aria-hidden="true" />
            <p className="text-slate-500 text-sm">No events yet</p>
            <p className="text-slate-600 text-xs">Events will appear here as they happen</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04] max-h-[calc(100vh-14rem)] overflow-y-auto">
            {activity.map(a => (
              <div key={a.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-white/[0.025] transition-colors">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium font-mono">{a.type}</p>
                  {a.payload != null && (
                    <pre className="text-slate-500 text-[10px] mt-0.5 font-mono whitespace-pre-wrap break-all">
                      {JSON.stringify(a.payload, null, 2).slice(0, 200)}
                    </pre>
                  )}
                </div>
                <span className="text-slate-600 text-xs shrink-0">{timeAgo(a.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
