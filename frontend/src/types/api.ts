// ─────────────────────────────────────────────────────────────────────────────
// src/types/api.ts
// Generated from GET /openapi.json — DO NOT invent fields
// ─────────────────────────────────────────────────────────────────────────────

// ── Session ──────────────────────────────────────────────────────────────────
export interface CreateSessionRequest {
  role?: 'CITIZEN' | 'OPERATOR' | 'RESPONDER' | 'ADMIN' | 'SYSTEM'
  incident_id?: string | null
}

export interface SessionResponse {
  session_id: string
  conversation_id: string
  session_token: string
  ws_url: string
  role: string
  expires_at: string
}

// ── Incidents ─────────────────────────────────────────────────────────────────
export type IncidentStatus = 'REPORTED' | 'TRIAGED' | 'DISPATCHED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type IncidentType = 'FIRE' | 'MEDICAL' | 'POLICE' | 'NATURAL_DISASTER' | 'ACCIDENT' | 'OTHER'
export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface CreateIncidentRequest {
  description: string
  location_text?: string | null
  incident_type?: string | null
  severity?: string | null
}

export interface IncidentResponse {
  id: string
  reference_number: string
  status: IncidentStatus
  type: IncidentType | null
  severity: IncidentSeverity | null
  description: string | null
  location_text: string | null
  address_resolved: string | null
  latitude: number | null
  longitude: number | null
  created_at: string
  updated_at: string
  triaged_at: string | null
  dispatched_at: string | null
  resolved_at: string | null
}

// ── Responders ────────────────────────────────────────────────────────────────
export type ResponderType = 'MEDICAL' | 'FIRE' | 'POLICE' | 'HAZMAT' | 'RESCUE'
export type ResponderStatus = 'AVAILABLE' | 'EN_ROUTE' | 'ON_SCENE' | 'UNAVAILABLE' | 'OFFLINE'

export interface CreateResponderRequest {
  name: string
  unit_id: string
  responder_type: ResponderType
  latitude?: number | null
  longitude?: number | null
}

export interface ResponderResponse {
  id: string
  name: string
  unit_id: string
  responder_type: ResponderType
  status: ResponderStatus
  latitude: number | null
  longitude: number | null
  last_location_update: string | null
}

// ── Incident Facts ─────────────────────────────────────────────────────────────
export interface IncidentFact {
  fact_key: string
  fact_value: unknown
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  source?: string
}

// ── Voice WebSocket Protocol ──────────────────────────────────────────────────
// Client → Server:
//   Binary frames: raw PCM audio (16-bit LE, 16kHz, mono) via ArrayBuffer
//   Text frames:
//     { type: 'end_session' }
//     { type: 'pong' }
//
// Server → Client (text JSON):
//   { type: 'session.ready', conversation_id: string, role: string }
//   { type: 'transcript', role: 'CITIZEN'|'AGENT', text: string, timestamp: string }
//   { type: 'ping' }
//   { type: 'session.ended' }
//   { type: 'error', message: string }
//
// Server → Client (binary):
//   Raw audio bytes (TTS from agent)

export interface VoiceWSMessage {
  type: 'session.ready' | 'transcript' | 'ping' | 'session.ended' | 'error'
}

export interface SessionReadyMessage extends VoiceWSMessage {
  type: 'session.ready'
  conversation_id: string
  role: string
}

export interface TranscriptMessage extends VoiceWSMessage {
  type: 'transcript'
  role: string
  text: string
  timestamp: string
}

export interface PingMessage extends VoiceWSMessage {
  type: 'ping'
}

export interface SessionEndedMessage extends VoiceWSMessage {
  type: 'session.ended'
}

export interface ErrorMessage extends VoiceWSMessage {
  type: 'error'
  message: string
}

export type AnyVoiceMessage = SessionReadyMessage | TranscriptMessage | PingMessage | SessionEndedMessage | ErrorMessage

// ── Events WebSocket Protocol ─────────────────────────────────────────────────
// Client → Server:
//   { type: 'subscribe', channel: string }
//   { type: 'ping' }
//
// Server → Client:
//   { type: 'connected', channel: string }
//   { type: 'subscribed', channel: string }
//   { type: 'pong' }
//   { type: 'ping' }
//   Event frames: { type: <event_type>, event_id: string, payload: unknown, timestamp: string }
//
// Channels:
//   incidents:all
//   incident:{uuid}
//   responder:{uuid}

export interface EventWSMessage {
  type: string
  event_id?: string
  payload?: unknown
  timestamp?: string
  channel?: string
}

// ── API Error ─────────────────────────────────────────────────────────────────
export interface ApiError {
  code: string
  message: string
  details: Record<string, unknown>
}

export interface ApiErrorResponse {
  error: ApiError
}
