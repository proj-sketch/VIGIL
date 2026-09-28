// hooks/useEventSocket.ts — Initialize and connect the shared event socket
import { useEffect, useRef } from 'react'
import { eventSocket } from '../services/eventSocket'
import { useMissionControlStore } from '../stores/missionControlStore'
import type { EventWSMessage } from '../types/api'
import type { IncidentResponse, ResponderResponse } from '../types/api'

export function useEventSocket() {
  // Use ref to access store actions without causing re-renders
  const storeRef = useRef(useMissionControlStore.getState)

  useEffect(() => {
    // Connect on mount — subscribe to both incident and responder channels
    eventSocket.connect('incidents:all')
    eventSocket.subscribe('responders:all')

    // Status updates — use setTimeout to avoid state update during render
    const offStatus = eventSocket.onStatus((s) => {
      setTimeout(() => {
        storeRef.current().setConnectionStatus(s)
      }, 0)
    })

    // Event handler
    const offEvent = eventSocket.onEvent((msg: EventWSMessage) => {
      const state = storeRef.current()
      state.addActivity({ type: msg.type, payload: msg.payload })

      const payload = msg.payload as Record<string, unknown> | undefined

      // Build a full IncidentResponse from the enriched outbox payload
      const toIncident = (p: Record<string, unknown>): IncidentResponse | null => {
        const id = (p.id ?? p.incident_id) as string | undefined
        if (!id) return null
        return {
          id,
          reference_number: (p.reference_number as string) ?? '',
          status: (p.status as string) ?? 'REPORTED',
          type: (p.type as string) ?? null,
          severity: (p.severity as string) ?? null,
          description: (p.description as string) ?? null,
          location_text: (p.location_text as string) ?? null,
          latitude: (p.latitude as number) ?? null,
          longitude: (p.longitude as number) ?? null,
          address_resolved: (p.address_resolved as string) ?? null,
          created_at: (p.created_at as string) ?? new Date().toISOString(),
          updated_at: (p.updated_at as string) ?? new Date().toISOString(),
          triaged_at: (p.triaged_at as string) ?? null,
          dispatched_at: (p.dispatched_at as string) ?? null,
          resolved_at: (p.resolved_at as string) ?? null,
          reporter_conversation_id: null,
          assigned_operator_id: null,
        } as unknown as IncidentResponse
      }

      switch (msg.type) {
        case 'incident.created':
        case 'incident.updated':
        case 'incident.status_changed':
        case 'incident.triaged':
        case 'incident.dispatched':
        case 'incident.resolved': {
          if (payload) {
            const inc = toIncident(payload)
            if (inc) state.upsertIncident(inc)
          }
          const notification = buildIncidentNotification(msg.type, payload ?? {})
          if (notification) state.addNotification(notification)
          break
        }
        case 'responder.updated':
        case 'responder.assigned': {
          if (payload?.responder) {
            state.upsertResponder(payload.responder as ResponderResponse)
          }
          break
        }
      }
    })

    return () => {
      offStatus()
      offEvent()
    }
  }, []) // Run once on mount — stable because eventSocket is a singleton
}

function buildIncidentNotification(
  type: string,
  payload: Record<string, unknown>
): { title: string; message: string; level: 'info' | 'warning' | 'critical' } | null {
  const ref = (payload?.reference_number ?? payload?.incident_id ?? 'Unknown') as string
  const severity = (payload?.severity as string | undefined)?.toUpperCase()
  const desc = (payload?.description as string | undefined)?.slice(0, 60) ?? ''

  switch (type) {
    case 'incident.created':
      return {
        title: '🚨 New Incident',
        message: `${ref}${desc ? ` — ${desc}` : ''}`,
        level: severity === 'CRITICAL' ? 'critical' : severity === 'HIGH' ? 'warning' : 'info',
      }
    case 'incident.status_changed':
      return {
        title: 'Status Changed',
        message: `${ref} → ${(payload?.to_status as string) ?? ''}`,
        level: 'info',
      }
    case 'incident.triaged':
      return { title: 'Incident Triaged', message: `${ref} has been triaged`, level: 'info' }
    case 'incident.dispatched':
      return { title: 'Responder Dispatched', message: `Responders dispatched to ${ref}`, level: 'info' }
    default:
      return null
  }
}
