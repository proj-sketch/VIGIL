// services/api.ts — Centralized HTTP client
import type { 
  CreateSessionRequest, SessionResponse,
  CreateIncidentRequest, IncidentResponse,
  CreateResponderRequest, ResponderResponse,
  IncidentFact
} from '../types/api'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  if (!res.ok) {
    let errorCode = `HTTP_${res.status}`
    let errorMessage = `Request failed: ${res.status} ${res.statusText}`
    let details: Record<string, unknown> = {}
    try {
      const errJson = await res.json()
      if (errJson?.error) {
        errorCode = errJson.error.code ?? errorCode
        errorMessage = errJson.error.message ?? errorMessage
        details = errJson.error.details ?? {}
      }
    } catch {
      // ignore JSON parse error
    }
    throw new ApiError(res.status, errorCode, errorMessage, details)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

// ── Health ─────────────────────────────────────────────────────────────────────
export const health = {
  live: () => request<{ status: string }>('GET', '/health/live'),
  ready: () => request<{ status: string; checks: Record<string, unknown> }>('GET', '/health/ready'),
}

// ── Voice ──────────────────────────────────────────────────────────────────────
export const voice = {
  createSession: (req: CreateSessionRequest = {}) =>
    request<SessionResponse>('POST', '/voice/sessions', req),
  getSession: (sessionId: string) =>
    request<Record<string, unknown>>('GET', `/voice/sessions/${sessionId}`),
}

// ── Incidents ──────────────────────────────────────────────────────────────────
export const incidents = {
  create: (req: CreateIncidentRequest) =>
    request<IncidentResponse>('POST', '/incidents', req),
  
  list: (params?: { status?: string; type?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.type) qs.set('type', params.type)
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return request<IncidentResponse[]>('GET', `/incidents${q ? `?${q}` : ''}`)
  },

  get: (id: string) => request<IncidentResponse>('GET', `/incidents/${id}`),

  updateStatus: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>('PATCH', `/incidents/${id}/status`, body),

  getFacts: (id: string) =>
    request<IncidentFact[]>('GET', `/incidents/${id}/facts`),
}

// ── Responders ─────────────────────────────────────────────────────────────────
export const responders = {
  create: (req: CreateResponderRequest) =>
    request<ResponderResponse>('POST', '/responders', req),

  list: (params?: { available_only?: boolean; responder_type?: string }) => {
    const qs = new URLSearchParams()
    if (params?.available_only) qs.set('available_only', 'true')
    if (params?.responder_type) qs.set('responder_type', params.responder_type)
    const q = qs.toString()
    return request<ResponderResponse[]>('GET', `/responders${q ? `?${q}` : ''}`)
  },

  get: (id: string) => request<ResponderResponse>('GET', `/responders/${id}`),

  updateLocation: (id: string, body: { latitude: number; longitude: number }) =>
    request<Record<string, unknown>>('PATCH', `/responders/${id}/location`, body),

  assign: (id: string, body: { incident_id: string }) =>
    request<Record<string, unknown>>('POST', `/responders/${id}/assign`, body),
}

export { ApiError }
export default { health, voice, incidents, responders }
