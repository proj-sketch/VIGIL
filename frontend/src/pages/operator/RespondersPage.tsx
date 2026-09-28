// pages/operator/RespondersPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, RefreshCw, AlertTriangle, Plus } from 'lucide-react'
import { responders as respondersApi } from '../../services/api'
import { RESPONDER_STATUS_COLOR, RESPONDER_TYPE_ICON, timeAgo } from '../../utils/formatters'
import type { ResponderResponse } from '../../types/api'

const STATUS_OPTIONS = ['AVAILABLE', 'EN_ROUTE', 'ON_SCENE', 'UNAVAILABLE', 'OFFLINE']

export default function RespondersPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('')

  const { data: responderList = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['responders'],
    queryFn: () => respondersApi.list(),
    refetchInterval: 30_000,
  })

  const filtered = filter
    ? responderList.filter((r: ResponderResponse) => r.status === filter || r.responder_type === filter)
    : responderList

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-white text-xl font-bold">Responders</h1>
          <p className="text-slate-500 text-sm">{filtered.length} unit{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] text-slate-400 hover:text-white transition-all text-sm"
          aria-label="Refresh responders"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Status filters */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === '' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30' : 'bg-white/[0.04] text-slate-400 border border-white/[0.05] hover:text-white'}`}
          aria-pressed={filter === ''}
        >
          All
        </button>
        {STATUS_OPTIONS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(f => f === s ? '' : s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === s ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30' : 'bg-white/[0.04] text-slate-400 border border-white/[0.05] hover:text-white'}`}
            aria-pressed={filter === s}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Responder grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <svg className="w-7 h-7 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2" role="alert">
          <AlertTriangle className="w-8 h-8 text-red-500" aria-hidden="true" />
          <p className="text-red-400 text-sm">Failed to load responders</p>
          <button onClick={() => refetch()} className="text-blue-400 text-xs underline">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 bg-[#141c33] border border-white/[0.06] rounded-2xl">
          <Users className="w-8 h-8 text-slate-700" aria-hidden="true" />
          <p className="text-slate-500 text-sm">No responders found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((r: ResponderResponse) => (
            <div
              key={r.id}
              className="bg-[#141c33] border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.12] transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl" aria-hidden="true">{RESPONDER_TYPE_ICON[r.responder_type] ?? '🚨'}</span>
                  <div>
                    <p className="text-white font-bold text-sm">{r.unit_id}</p>
                    <p className="text-slate-500 text-xs">{r.responder_type}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${RESPONDER_STATUS_COLOR[r.status] ?? ''}`}>
                  {r.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-slate-400 text-xs mb-2">{r.name}</p>
              {r.latitude && r.longitude && (
                <p className="text-slate-600 text-[10px] font-mono">
                  {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                </p>
              )}
              {r.last_location_update && (
                <p className="text-slate-700 text-[10px] mt-1">
                  Last seen {timeAgo(r.last_location_update)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
