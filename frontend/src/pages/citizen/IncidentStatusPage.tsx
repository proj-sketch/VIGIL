// pages/citizen/IncidentStatusPage.tsx
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MapPin, Clock, ShieldAlert, CheckCircle2, Circle } from 'lucide-react'
import { incidents } from '../../services/api'
import { SeverityBadge } from '../../components/ui/SeverityBadge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { INCIDENT_TYPE_ICON, formatDateTime, incidentStatusSteps, statusIndex } from '../../utils/formatters'
import type { IncidentStatus } from '../../types/api'

const STEP_LABEL: Record<IncidentStatus, string> = {
  REPORTED: 'Reported',
  TRIAGED: 'Verified',
  DISPATCHED: 'Dispatched',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}

export default function IncidentStatusPage() {
  const { id } = useParams<{ id: string }>()

  const { data: incident, isLoading, isError } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => incidents.get(id!),
    refetchInterval: 10_000, // Poll every 10s for citizen status page
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080d18] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 text-red-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-slate-400 text-sm">Loading incident…</span>
        </div>
      </div>
    )
  }

  if (isError || !incident) {
    return (
      <div className="min-h-screen bg-[#080d18] flex flex-col items-center justify-center gap-4 px-6">
        <ShieldAlert className="w-12 h-12 text-red-500" aria-hidden="true" />
        <h2 className="text-white font-bold text-lg">Incident not found</h2>
        <Link to="/emergency" className="text-red-400 text-sm underline">Return to Emergency</Link>
      </div>
    )
  }

  const steps = incidentStatusSteps()
  const currentStep = statusIndex(incident.status)
  const location = incident.address_resolved ?? incident.location_text

  return (
    <div className="min-h-screen bg-[#080d18] flex flex-col">
      <header className="flex items-center gap-3 px-6 py-5">
        <Link to="/emergency" className="text-slate-400 hover:text-white transition-colors" aria-label="Back to emergency">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-500" aria-hidden="true" />
          <span className="text-white font-bold tracking-tight">RAPID HELP</span>
        </div>
      </header>

      <main className="flex-1 px-6 pb-10 max-w-md mx-auto w-full">
        {/* Reference */}
        <div className="animate-fade-in-up mb-6">
          <p className="text-slate-500 text-xs font-mono mb-1">INCIDENT ID</p>
          <h1 className="text-white text-2xl font-black font-mono">{incident.reference_number}</h1>
        </div>

        {/* Type + Severity + Status row */}
        <div className="flex flex-wrap gap-2 mb-6 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          {incident.type && (
            <span className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-3 py-1.5 text-sm font-semibold text-white">
              <span aria-hidden="true">{INCIDENT_TYPE_ICON[incident.type] ?? '⚠️'}</span>
              {incident.type}
            </span>
          )}
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
        </div>

        {/* Location */}
        {location && (
          <div className="flex items-start gap-3 bg-[#141c33] rounded-xl p-4 mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <MapPin className="w-4 h-4 text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Location</p>
              <p className="text-white text-sm">{location}</p>
            </div>
          </div>
        )}

        {/* Status timeline */}
        <div className="bg-[#141c33] rounded-2xl p-5 mb-6 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <h2 className="text-slate-400 text-xs font-bold tracking-widest uppercase mb-4">Status Timeline</h2>
          <ol className="relative">
            {steps.map((step, idx) => {
              const done = idx <= currentStep
              const active = idx === currentStep
              return (
                <li key={step} className="flex items-start gap-3 mb-4 last:mb-0">
                  <div className="flex flex-col items-center">
                    {done ? (
                      <CheckCircle2 className={`w-5 h-5 ${active ? 'text-green-400' : 'text-green-600'}`} aria-hidden="true" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-700" aria-hidden="true" />
                    )}
                    {idx < steps.length - 1 && (
                      <span className={`w-0.5 h-4 mt-1 ${done ? 'bg-green-700' : 'bg-slate-800'}`} aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${active ? 'text-white' : done ? 'text-slate-400' : 'text-slate-600'}`}>
                      {STEP_LABEL[step]}
                    </p>
                    {active && (
                      <p className="text-xs text-green-400 mt-0.5">Current status</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        {/* Timestamps */}
        <div className="flex items-center gap-2 text-slate-600 text-xs animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <Clock className="w-3 h-3" aria-hidden="true" />
          <span>Reported {formatDateTime(incident.created_at)}</span>
        </div>

        <p className="mt-6 text-slate-500 text-xs text-center animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          This page updates automatically. Help is on the way.
        </p>
      </main>
    </div>
  )
}
