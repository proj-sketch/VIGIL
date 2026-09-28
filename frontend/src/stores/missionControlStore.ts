// stores/missionControlStore.ts
import { create } from 'zustand'
import type { IncidentResponse, ResponderResponse } from '../types/api'
import type { EventSocketStatus } from '../services/eventSocket'

export interface Notification {
  id: string
  title: string
  message: string
  level: 'info' | 'warning' | 'critical'
  timestamp: string
  read: boolean
}

export interface ActivityEntry {
  id: string
  type: string
  payload: unknown
  timestamp: string
}

interface MissionControlState {
  // Connection
  connectionStatus: EventSocketStatus

  // Incidents (realtime-updated)
  incidents: IncidentResponse[]
  selectedIncidentId: string | null

  // Responders (realtime-updated)
  responders: ResponderResponse[]
  selectedResponderId: string | null

  // Notifications
  notifications: Notification[]

  // Activity feed
  activity: ActivityEntry[]

  // Actions
  setConnectionStatus: (s: EventSocketStatus) => void
  setIncidents: (incidents: IncidentResponse[]) => void
  upsertIncident: (incident: IncidentResponse) => void
  selectIncident: (id: string | null) => void
  setResponders: (responders: ResponderResponse[]) => void
  upsertResponder: (responder: ResponderResponse) => void
  selectResponder: (id: string | null) => void
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markAllRead: () => void
  addActivity: (a: Omit<ActivityEntry, 'id' | 'timestamp'>) => void
}

export const useMissionControlStore = create<MissionControlState>()((set) => ({
  connectionStatus: 'DISCONNECTED',
  incidents: [],
  selectedIncidentId: null,
  responders: [],
  selectedResponderId: null,
  notifications: [],
  activity: [],

  setConnectionStatus: (s) => set({ connectionStatus: s }),

  setIncidents: (incidents) => set({ incidents }),

  upsertIncident: (incident) => set((state) => {
    const idx = state.incidents.findIndex(i => i.id === incident.id)
    if (idx >= 0) {
      const updated = [...state.incidents]
      updated[idx] = incident
      return { incidents: updated }
    }
    return { incidents: [incident, ...state.incidents] }
  }),

  selectIncident: (id) => set({ selectedIncidentId: id }),

  setResponders: (responders) => set({ responders }),

  upsertResponder: (responder) => set((state) => {
    const idx = state.responders.findIndex(r => r.id === responder.id)
    if (idx >= 0) {
      const updated = [...state.responders]
      updated[idx] = responder
      return { responders: updated }
    }
    return { responders: [...state.responders, responder] }
  }),

  selectResponder: (id) => set({ selectedResponderId: id }),

  addNotification: (n) => set((state) => ({
    notifications: [
      {
        id: `notif-${Date.now()}`,
        timestamp: new Date().toISOString(),
        read: false,
        ...n,
      },
      ...state.notifications.slice(0, 49),
    ],
  })),

  markAllRead: () => set((state) => ({
    notifications: state.notifications.map(n => ({ ...n, read: true })),
  })),

  addActivity: (a) => set((state) => ({
    activity: [
      {
        id: `act-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        ...a,
      },
      ...state.activity.slice(0, 199),
    ],
  })),
}))
