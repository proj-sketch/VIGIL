// stores/voiceStore.ts
import { create } from 'zustand'
import type { TranscriptMessage } from '../types/api'
import type { VoiceSocketStatus } from '../services/voiceSocket'

export interface TranscriptEntry {
  id: string
  role: string // 'CITIZEN' | 'AGENT' | 'user' | 'assistant'
  text: string
  timestamp: string
}

interface VoiceState {
  // Session
  sessionId: string | null
  conversationId: string | null
  sessionToken: string | null
  wsUrl: string | null
  expiresAt: string | null

  // Connection
  connectionStatus: VoiceSocketStatus
  isListening: boolean
  isSpeaking: boolean
  volumeLevel: number // 0..1

  // Transcript
  transcript: TranscriptEntry[]
  agentMessage: string | null

  // Incident linked
  incidentId: string | null
  incidentRefNumber: string | null
  incidentStatus: string | null

  // Error
  error: string | null

  // Actions
  setSession: (s: { sessionId: string; conversationId: string; sessionToken: string; wsUrl: string; expiresAt: string }) => void
  setConnectionStatus: (s: VoiceSocketStatus) => void
  setIsListening: (v: boolean) => void
  setIsSpeaking: (v: boolean) => void
  setVolumeLevel: (v: number) => void
  addTranscript: (msg: TranscriptMessage) => void
  setAgentMessage: (m: string | null) => void
  setError: (e: string | null) => void
  setIncident: (id: string, ref: string) => void
  setIncidentStatus: (s: string) => void
  reset: () => void
}

export const useVoiceStore = create<VoiceState>()((set) => ({
  sessionId: null,
  conversationId: null,
  sessionToken: null,
  wsUrl: null,
  expiresAt: null,
  connectionStatus: 'IDLE',
  isListening: false,
  isSpeaking: false,
  volumeLevel: 0,
  transcript: [],
  agentMessage: null,
  incidentId: null,
  incidentRefNumber: null,
  incidentStatus: null,
  error: null,

  setSession: (s) => set({
    sessionId: s.sessionId,
    conversationId: s.conversationId,
    sessionToken: s.sessionToken,
    wsUrl: s.wsUrl,
    expiresAt: s.expiresAt,
  }),

  setConnectionStatus: (s) => set({
    connectionStatus: s,
    isListening: s === 'LISTENING',
    isSpeaking: s === 'SPEAKING',
  }),

  setIsListening: (v) => set({ isListening: v }),
  setIsSpeaking: (v) => set({ isSpeaking: v }),
  setVolumeLevel: (v) => set({ volumeLevel: v }),

  addTranscript: (msg) => set((state) => ({
    transcript: [
      ...state.transcript,
      {
        id: `${Date.now()}-${Math.random()}`,
        role: msg.role,
        text: msg.text,
        timestamp: msg.timestamp,
      },
    ],
    agentMessage: (msg.role === 'AGENT' || msg.role === 'assistant') ? msg.text : state.agentMessage,
  })),

  setAgentMessage: (m) => set({ agentMessage: m }),
  setError: (e) => set({ error: e }),
  setIncident: (id, ref) => set({ incidentId: id, incidentRefNumber: ref }),
  setIncidentStatus: (s) => set({ incidentStatus: s }),

  reset: () => set({
    sessionId: null, conversationId: null, sessionToken: null, wsUrl: null, expiresAt: null,
    connectionStatus: 'IDLE', isListening: false, isSpeaking: false, volumeLevel: 0,
    transcript: [], agentMessage: null, incidentId: null, incidentRefNumber: null,
    incidentStatus: null, error: null,
  }),
}))
