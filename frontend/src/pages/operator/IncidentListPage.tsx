// pages/operator/IncidentListPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, Filter, RefreshCw, Plus, AlertTriangle } from 'lucide-react'
import { incidents as incidentsApi } from '../../services/api'
import { SeverityBadge } from '../../components/ui/SeverityBadge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { timeAgo, INCIDENT_TYPE_ICON } from '../../utils/formatters'
import type { IncidentStatus, IncidentResponse } from '../../types/api'

const STATUS_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All', value: '' },
  { label: 'Reported', value: 'REPORTED' },
  { label: 'Triaged', value: 'TRIAGED' },
  { label: 'Dispatched', value: 'DISPATCHED' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Resolved', value: 'RESOLVED' },
]

export default function IncidentListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const { data: incidentList = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['incidents', statusFilter],
    queryFn: () => incidentsApi.list({ status: statusFilter || undefined, limit: 100 }),
    refetchInterval: 30_000,
  })

  const filtered = search
    ? incidentList.filter(i =>
        i.reference_number.toLowerCase().includes(search.toLowerCase()) ||
        (i.location_text ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (i.description ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : incidentList

  const triageMutation = useMutation({
    mutationFn: (id: string) => incidentsApi.updateStatus(id, { action: 'triage' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-white text-xl font-bold">Incidents</h1>
          <p className="text-slate-500 text-sm">{filtered.length} incident{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] text-slate-400 hover:text-white transition-all text-sm"
          aria-label="Refresh incidents"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search incidents…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[#141c33] border border-white/[0.06] rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/40 transition-colors"
            aria-label="Search incidents"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === f.value
                  ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                  : 'bg-white/[0.04] text-slate-400 border border-white/[0.05] hover:text-white hover:bg-white/[0.07]'
              }`}
              aria-pressed={statusFilter === f.value}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#141c33] border border-white/[0.06] rounded-2xl overflow-hidden">
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
            <p className="text-red-400 text-sm">Failed to load incidents</p>
            <button onClick={() => refetch()} className="text-blue-400 text-xs underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <AlertTriangle className="w-8 h-8 text-slate-700" aria-hidden="true" />
            <p className="text-slate-500 text-sm">{search ? 'No matching incidents' : 'No incidents'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.05] text-slate-500 text-xs font-semibold uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Incident</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Severity</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Location</th>
                  <th className="text-left px-4 py-3">Reported</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(inc => (
                  <tr
                    key={inc.id}
                    className="hover:bg-white/[0.025] transition-colors cursor-pointer"
                    onClick={() => navigate(`/operator/incidents/${inc.id}`)}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && navigate(`/operator/incidents/${inc.id}`)}
                    role="row"
                    aria-label={`Incident ${inc.reference_number}`}
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-white font-bold font-mono text-xs">{inc.reference_number}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex items-center gap-1.5 text-slate-300 text-xs">
                        <span aria-hidden="true">{inc.type ? INCIDENT_TYPE_ICON[inc.type] ?? '⚠️' : '⚠️'}</span>
                        {inc.type ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5"><SeverityBadge severity={inc.severity} /></td>
                    <td className="px-4 py-3.5"><StatusBadge status={inc.status} /></td>
                    <td className="px-4 py-3.5 max-w-[180px]">
                      <span className="text-slate-400 text-xs truncate block">
                        {inc.location_text ?? inc.address_resolved ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-slate-500 text-xs">{timeAgo(inc.created_at)}</span>
                    </td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      {inc.status === 'REPORTED' && (
                        <button
                          onClick={() => triageMutation.mutate(inc.id)}
                          disabled={triageMutation.isPending}
                          className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/20 text-xs font-semibold transition-all disabled:opacity-50"
                          aria-label={`Triage incident ${inc.reference_number}`}
                        >
                          Triage
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
