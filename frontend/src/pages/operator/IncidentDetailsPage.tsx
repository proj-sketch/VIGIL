// pages/operator/IncidentDetailsPage.tsx
import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MapPin, Clock, CheckCircle2, Circle, AlertTriangle, Zap, Users } from 'lucide-react'
import { incidents as incidentsApi, responders as respondersApi } from '../../services/api'
import { SeverityBadge } from '../../components/ui/SeverityBadge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { formatDateTime, INCIDENT_TYPE_ICON, incidentStatusSteps, statusIndex } from '../../utils/formatters'
import type { IncidentResponse, ResponderResponse } from '../../types/api'

const STEPS_LABELS: Record<string, string> = {
  REPORTED: 'Reported',
  TRIAGED: 'Triaged',
  DISPATCHED: 'Dispatched',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
}

type Tab = 'overview' | 'facts' | 'responders'

export default function IncidentDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [showDispatch, setShowDispatch] = useState(false)

  const { data: incident, isLoading, isError } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => incidentsApi.get(id!),
    enabled: !!id,
    refetchInterval: 15_000,
  })

  const { data: facts = [] } = useQuery({
    queryKey: ['incident-facts', id],
    queryFn: () => incidentsApi.getFacts(id!),
    enabled: !!id && tab === 'facts',
  })

  const { data: allResponders = [] } = useQuery({
    queryKey: ['responders'],
    queryFn: () => respondersApi.list(),
    enabled: showDispatch,
  })

  const updateMutation = useMutation({
    mutationFn: (action: string) => incidentsApi.updateStatus(id!, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident', id] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
    },
  })

  const assignMutation = useMutation({
    mutationFn: (responderId: string) => respondersApi.assign(responderId, { incident_id: id! }),
    onSuccess: () => {
      setShowDispatch(false)
      qc.invalidateQueries({ queryKey: ['incident', id] })
    },
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <svg className="w-7 h-7 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  )

  if (isError || !incident) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertTriangle className="w-10 h-10 text-red-500" aria-hidden="true" />
      <p className="text-slate-400">Incident not found</p>
      <Link to="/operator/incidents" className="text-blue-400 text-sm">← Back</Link>
    </div>
  )

  const steps = incidentStatusSteps()
  const currentStep = statusIndex(incident.status)
  const location = incident.address_resolved ?? incident.location_text
  const availableResponders = allResponders.filter((r: ResponderResponse) => r.status === 'AVAILABLE')

  return (
    <div className="p-6 max-w-4xl space-y-5">
      {/* Back + header */}
      <div>
        <Link
          to="/operator/incidents"
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Incidents
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-white font-black text-xl font-mono">{incident.reference_number}</h1>
              {incident.type && <span className="text-xl" aria-hidden="true">{INCIDENT_TYPE_ICON[incident.type] ?? '⚠️'}</span>}
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
              {incident.type && <span className="text-slate-400 text-xs">{incident.type}</span>}
            </div>
          </div>
          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {incident.status === 'REPORTED' && (
              <button
                onClick={() => updateMutation.mutate('triage')}
                disabled={updateMutation.isPending}
                className="px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/20 text-sm font-semibold transition-all disabled:opacity-50"
              >
                Triage
              </button>
            )}
            {incident.status === 'TRIAGED' && (
              <button
                onClick={() => setShowDispatch(true)}
                className="px-4 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/20 text-sm font-semibold transition-all"
              >
                <Zap className="w-3.5 h-3.5 inline mr-1.5" aria-hidden="true" />
                Dispatch
              </button>
            )}
            {(incident.status === 'DISPATCHED' || incident.status === 'IN_PROGRESS') && (
              <button
                onClick={() => updateMutation.mutate('resolve')}
                disabled={updateMutation.isPending}
                className="px-4 py-2 rounded-xl bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/20 text-sm font-semibold transition-all disabled:opacity-50"
              >
                Resolve
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dispatch modal */}
      {showDispatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Dispatch responder">
          <div className="bg-[#141c33] border border-white/[0.1] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-bold mb-1">Dispatch Responder</h3>
            <p className="text-slate-400 text-sm mb-4">Select an available responder to assign to this incident.</p>
            {availableResponders.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">No available responders</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
                {availableResponders.map((r: ResponderResponse) => (
                  <button
                    key={r.id}
                    onClick={() => assignMutation.mutate(r.id)}
                    disabled={assignMutation.isPending}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-left transition-all disabled:opacity-50"
                    aria-label={`Assign ${r.unit_id}`}
                  >
                    <Users className="w-4 h-4 text-green-400 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-white text-sm font-semibold">{r.unit_id}</p>
                      <p className="text-slate-400 text-xs">{r.name} · {r.responder_type}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowDispatch(false)}
              className="w-full py-2.5 rounded-xl bg-white/[0.04] text-slate-400 text-sm font-medium hover:bg-white/[0.08] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.05]">
        {(['overview', 'facts', 'responders'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize transition-all border-b-2 -mb-px ${
              tab === t
                ? 'border-blue-500 text-blue-300'
                : 'border-transparent text-slate-500 hover:text-white'
            }`}
            aria-selected={tab === t}
            role="tab"
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up">
          {/* Info card */}
          <div className="bg-[#141c33] border border-white/[0.06] rounded-2xl p-5 space-y-4">
            {location && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Location</p>
                  <p className="text-white text-sm">{location}</p>
                </div>
              </div>
            )}
            {incident.description && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Description</p>
                <p className="text-slate-300 text-sm leading-relaxed">{incident.description}</p>
              </div>
            )}
            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <Clock className="w-3 h-3" aria-hidden="true" />
              <span>Reported {formatDateTime(incident.created_at)}</span>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-[#141c33] border border-white/[0.06] rounded-2xl p-5">
            <h3 className="text-slate-400 text-xs font-bold tracking-widest uppercase mb-4">Timeline</h3>
            <ol>
              {steps.map((step, idx) => {
                const done = idx <= currentStep
                const active = idx === currentStep
                const ts = step === 'TRIAGED' ? incident.triaged_at
                  : step === 'DISPATCHED' ? incident.dispatched_at
                  : step === 'RESOLVED' ? incident.resolved_at
                  : step === 'REPORTED' ? incident.created_at
                  : null
                return (
                  <li key={step} className="flex items-start gap-3 mb-3 last:mb-0">
                    <div className="flex flex-col items-center mt-0.5">
                      {done
                        ? <CheckCircle2 className={`w-4 h-4 ${active ? 'text-green-400' : 'text-green-700'}`} aria-hidden="true" />
                        : <Circle className="w-4 h-4 text-slate-700" aria-hidden="true" />
                      }
                      {idx < steps.length - 1 && (
                        <span className={`w-0.5 h-3 mt-0.5 ${done ? 'bg-green-800' : 'bg-slate-800'}`} aria-hidden="true" />
                      )}
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${active ? 'text-white' : done ? 'text-slate-400' : 'text-slate-700'}`}>
                        {STEPS_LABELS[step]}
                      </p>
                      {ts && <p className="text-[10px] text-slate-600">{formatDateTime(ts)}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}

      {tab === 'facts' && (
        <div className="animate-fade-in-up">
          {facts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 bg-[#141c33] border border-white/[0.06] rounded-2xl">
              <p className="text-slate-500 text-sm">No facts extracted yet</p>
              <p className="text-slate-600 text-xs">Facts are collected during the voice session</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {facts.map((fact, idx) => (
                <div key={idx} className="bg-[#141c33] border border-white/[0.06] rounded-xl p-4">
                  <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
                    {String(fact.fact_key).replace(/_/g, ' ')}
                  </p>
                  <p className="text-white text-sm font-medium">{String(fact.fact_value)}</p>
                  {fact.confidence && (
                    <p className={`text-[10px] mt-1.5 font-semibold ${
                      fact.confidence === 'HIGH' ? 'text-green-400' :
                      fact.confidence === 'MEDIUM' ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {fact.confidence} confidence · {fact.source ?? 'AI extracted'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'responders' && (
        <div className="animate-fade-in-up">
          <div className="bg-[#141c33] border border-white/[0.06] rounded-2xl p-5">
            <p className="text-slate-500 text-sm">Responder assignment details are tracked via realtime events.</p>
            <button
              onClick={() => setShowDispatch(true)}
              className="mt-4 px-4 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/20 text-sm font-semibold transition-all"
            >
              Assign Responder
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
