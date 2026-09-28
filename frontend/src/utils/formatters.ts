// utils/formatters.ts
import type { IncidentSeverity, IncidentStatus, IncidentType, ResponderStatus, ResponderType } from '../types/api'

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Severity
export const SEVERITY_COLOR: Record<IncidentSeverity | string, string> = {
  CRITICAL: 'bg-red-500/20 text-red-400 border border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  MEDIUM: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  LOW: 'bg-green-500/20 text-green-400 border border-green-500/30',
}

export const SEVERITY_DOT: Record<IncidentSeverity | string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-green-500',
}

export const STATUS_COLOR: Record<IncidentStatus | string, string> = {
  REPORTED: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  TRIAGED: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  DISPATCHED: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  IN_PROGRESS: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  RESOLVED: 'bg-green-500/20 text-green-400 border border-green-500/30',
  CLOSED: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
}

export const RESPONDER_STATUS_COLOR: Record<ResponderStatus | string, string> = {
  AVAILABLE: 'bg-green-500/20 text-green-400',
  EN_ROUTE: 'bg-amber-500/20 text-amber-400',
  ON_SCENE: 'bg-blue-500/20 text-blue-400',
  UNAVAILABLE: 'bg-red-500/20 text-red-400',
  OFFLINE: 'bg-slate-500/20 text-slate-400',
}

export const RESPONDER_TYPE_ICON: Record<ResponderType | string, string> = {
  FIRE: '🔥',
  MEDICAL: '🚑',
  POLICE: '🚔',
  HAZMAT: '☢️',
  RESCUE: '⛑️',
}

export const INCIDENT_TYPE_ICON: Record<IncidentType | string, string> = {
  FIRE: '🔥',
  MEDICAL: '🚑',
  POLICE: '🚔',
  NATURAL_DISASTER: '🌪️',
  ACCIDENT: '💥',
  OTHER: '⚠️',
}

export function incidentStatusSteps(): IncidentStatus[] {
  return ['REPORTED', 'TRIAGED', 'DISPATCHED', 'IN_PROGRESS', 'RESOLVED']
}

export function statusIndex(status: IncidentStatus | string): number {
  return incidentStatusSteps().indexOf(status as IncidentStatus)
}

export const STEP_LABEL_OPERATOR: Record<IncidentStatus | string, string> = {
  REPORTED: 'Reported',
  TRIAGED: 'Triaged',
  DISPATCHED: 'Dispatched',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}
