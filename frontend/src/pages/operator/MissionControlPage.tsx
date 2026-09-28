// pages/operator/MissionControlPage.tsx — VIGIL Operation Control (Live Data)
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { incidents as incidentsApi, responders as respondersApi } from '../../services/api'
import { useMissionControlStore } from '../../stores/missionControlStore'
import { useEventSocket } from '../../hooks/useEventSocket'
import { eventSocket } from '../../services/eventSocket'
import { timeAgo, INCIDENT_TYPE_ICON, RESPONDER_TYPE_ICON } from '../../utils/formatters'
import type { IncidentResponse, ResponderResponse } from '../../types/api'
import { VIGILSidebar } from '../../components/layout/VIGILSidebar'

// ─── Colours ─────────────────────────────────────────────────────────────────
const C = {
  bg: '#0A0E14', panel: '#10151D', panel2: '#131920',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(255,255,255,0.10)',
  critical: '#E8442C', high: '#E8813C', medium: '#E0C22E',
  low: '#4CAF6D', blue: '#4E8FB5', purple: '#8B6FD8',
  text: '#E2E8F0', muted: '#64748B', dimmed: 'rgba(226,232,240,0.45)',
} as const

const SEV_COL: Record<string, string> = {
  CRITICAL: C.critical, HIGH: C.high, MEDIUM: C.medium, LOW: C.low,
}
const SEV_BG: Record<string, string> = {
  CRITICAL: 'rgba(232,68,44,0.15)', HIGH: 'rgba(232,129,60,0.15)',
  MEDIUM: 'rgba(224,194,46,0.15)',  LOW: 'rgba(76,175,109,0.15)',
}
const STATUS_COL: Record<string, string> = {
  AVAILABLE: C.low, EN_ROUTE: C.medium, ON_SCENE: C.blue,
  UNAVAILABLE: C.critical, OFFLINE: C.muted,
}
const INC_STATUS_COL: Record<string, string> = {
  REPORTED: C.blue, TRIAGED: C.purple, DISPATCHED: C.medium,
  IN_PROGRESS: C.high, RESOLVED: C.low, CLOSED: C.muted,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtStatus(s: string) { return s.replace(/_/g, ' ') }

function Chip({
  label, color, bg,
}: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      background: bg, color, border: `1px solid ${color}44`,
      borderRadius: 3, fontSize: 9, fontWeight: 700, padding: '2px 7px',
      letterSpacing: '0.06em', fontFamily: "'Space Grotesk',sans-serif",
      whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

function SevChip({ sev }: { sev: string | null }) {
  if (!sev) return null
  return <Chip label={sev} color={SEV_COL[sev] ?? C.muted} bg={SEV_BG[sev] ?? 'rgba(100,116,139,0.15)'} />
}

function StatusChip({ status }: { status: string }) {
  const col = STATUS_COL[status] ?? C.muted
  return <Chip label={fmtStatus(status)} color={col} bg={col + '22'} />
}

function IncStatusChip({ status }: { status: string }) {
  const col = INC_STATUS_COL[status] ?? C.muted
  return <Chip label={fmtStatus(status)} color={col} bg={col + '22'} />
}

// ─── Pulsing dot ─────────────────────────────────────────────────────────────
function PulseDot({ color = C.low }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: color, flexShrink: 0,
      animation: 'vigil-pulse 2s infinite',
    }} aria-hidden="true" />
  )
}

// ─── Live Clock ───────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dateStr = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
  const timeStr = now.toTimeString().slice(0, 8)
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: 'JetBrains Mono, monospace' }}>{dateStr}</div>
      <div style={{ fontSize: 15, color: C.text, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, letterSpacing: '0.04em' }}>{timeStr}</div>
    </div>
  )
}

// ─── Leaflet Map with real incident pins ─────────────────────────────────────
const INDIA_CENTER: [number, number] = [20.5937, 78.9629]
const CITY_FALLBACK_POSITIONS: [number, number][] = [
  [28.6139, 77.2090], // Delhi
  [19.0760, 72.8777], // Mumbai
  [12.9716, 77.5946], // Bangalore
  [13.0827, 80.2707], // Chennai
  [22.5726, 88.3639], // Kolkata
  [17.3850, 78.4867], // Hyderabad
  [23.0225, 72.5714], // Ahmedabad
  [18.5204, 73.8567], // Pune
  [26.9124, 75.7873], // Jaipur
]

const SEV_COLORS_HEX: Record<string, string> = {
  CRITICAL: '#E8442C', HIGH: '#E8813C', MEDIUM: '#E0C22E', LOW: '#4CAF6D',
}


function LeafletMap({ incidents }: { incidents: IncidentResponse[] }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const navigate = useNavigate()

  // Init map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: INDIA_CENTER,
      zoom: 5,
      zoomControl: true,
      attributionControl: false,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map)

    const markers = L.layerGroup().addTo(map)
    mapInstanceRef.current = map
    markersRef.current = markers

    return () => {
      map.remove()
      mapInstanceRef.current = null
      markersRef.current = null
    }
  }, [])

  // Update markers when incidents change
  useEffect(() => {
    const map = mapInstanceRef.current
    const markerLayer = markersRef.current
    if (!map || !markerLayer) return

    markerLayer.clearLayers()
    if (incidents.length === 0) return

    const bounds: [number, number][] = []

    incidents.forEach((inc, idx) => {
      let lat: number | null = inc.latitude ?? null
      let lng: number | null = inc.longitude ?? null

      // Use fallback city positions if no geocoords
      if (!lat || !lng) {
        const fb = CITY_FALLBACK_POSITIONS[idx % CITY_FALLBACK_POSITIONS.length]
        lat = fb[0]
        lng = fb[1]
      }

      bounds.push([lat, lng])
      const color = SEV_COLORS_HEX[inc.severity ?? ''] ?? '#64748B'
      const typeIcon = inc.type === 'FIRE' ? '🔥' : inc.type === 'MEDICAL' ? '🏥' : inc.type === 'ACCIDENT' ? '🚗' : inc.type === 'POLICE' ? '🚨' : '⚠️'

      const icon = L.divIcon({
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        html: `<div style="
          width:32px;height:32px;border-radius:50%;
          background:${color}22;border:2px solid ${color};
          display:flex;align-items:center;justify-content:center;
          font-size:14px;cursor:pointer;
          box-shadow:0 0 10px ${color}66;
        ">${typeIcon}</div>`,
      })

      const marker = L.marker([lat, lng], { icon })
      marker.bindPopup(`
        <div style="background:#10151D;color:#E2E8F0;border:1px solid ${color}44;border-radius:8px;padding:10px;min-width:160px;font-family:'Space Grotesk',sans-serif">
          <div style="color:${color};font-weight:700;font-size:11px;margin-bottom:4px">${inc.reference_number}</div>
          <div style="font-size:12px;margin-bottom:2px">${inc.type ?? 'Unknown'} · ${inc.severity ?? 'Unknown'}</div>
          <div style="font-size:10px;color:#64748B;margin-bottom:6px">${inc.location_text ?? inc.address_resolved ?? 'Location unknown'}</div>
          <div style="font-size:9px;color:#64748B">${inc.status}</div>
        </div>
      `, { className: 'vigil-popup' })
      marker.on('click', () => navigate(`/operator/incidents/${inc.id}`))
      markerLayer.addLayer(marker)
    })

    if (bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
      } catch {
        map.setView(INDIA_CENTER, 5)
      }
    }
  }, [incidents, navigate])

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden', borderRadius: '0 0 8px 8px', minHeight: 260 }}>
      <style>{`
        .vigil-popup .leaflet-popup-content-wrapper { background: transparent; border: none; box-shadow: none; padding: 0; }
        .vigil-popup .leaflet-popup-content { margin: 0; }
        .vigil-popup .leaflet-popup-tip-container { display: none; }
        .leaflet-control-zoom { border: 1px solid rgba(255,255,255,0.1) !important; }
        .leaflet-control-zoom a { background: #10151D !important; color: #E2E8F0 !important; border-color: rgba(255,255,255,0.08) !important; }
        .leaflet-control-zoom a:hover { background: #1a2030 !important; }
      `}</style>
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: 260 }} />
      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 500,
        background: 'rgba(10,14,20,0.88)', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', gap: 14, padding: '5px 12px', flexWrap: 'wrap',
      }}>
        {[
          { label: 'Fire', color: '#E8442C' }, { label: 'Medical', color: '#E8813C' },
          { label: 'Police', color: '#4E8FB5' }, { label: 'Accident', color: '#E0C22E' },
          { label: 'Other', color: '#64748B' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: '#64748B', fontFamily: 'Space Grotesk, sans-serif' }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Trend chart (pure SVG) ───────────────────────────────────────────────────
function TrendChart({ incidents }: { incidents: IncidentResponse[] }) {
  // Build 24-hour bucketed data from real incidents
  const hours = Array.from({ length: 12 }, (_, i) => i * 2) // 0,2,4,...22
  const labels = ['12M','2AM','4AM','6AM','8AM','10A','12P','2PM','4PM','6PM','8PM','10P']

  const bucket = (sev: string) => {
    return hours.map(h => {
      const start = new Date(); start.setHours(h, 0, 0, 0)
      const end = new Date(); end.setHours(h + 2, 0, 0, 0)
      return incidents.filter(i => {
        const t = new Date(i.created_at).getTime()
        return i.severity === sev && t >= start.getTime() && t < end.getTime()
      }).length
    })
  }

  const crit = bucket('CRITICAL')
  const high = bucket('HIGH')
  const med  = bucket('MEDIUM')
  const low  = bucket('LOW')

  // Fallback to demo data when DB is empty
  const hasData = incidents.length > 0
  const DEMO = {
    crit: [0,0,1,1,2,3,3,2,3,3,3,2],
    high: [1,2,2,3,4,5,6,7,7,7,6,5],
    med:  [2,3,4,5,6,7,8,9,10,12,11,10],
    low:  [1,1,2,2,3,4,4,4,4,4,3,3],
  }

  const W = 300, H = 130, pL = 8, pR = 8, pT = 10, pB = 20
  const cW = W - pL - pR, cH = H - pT - pB
  const allVals = [
    ...(hasData ? crit : DEMO.crit),
    ...(hasData ? high : DEMO.high),
    ...(hasData ? med  : DEMO.med),
    ...(hasData ? low  : DEMO.low),
  ]
  const maxVal = Math.max(...allVals, 1)
  const N = labels.length

  const mkPath = (data: number[]) =>
    data.map((v, i) => {
      const x = pL + (i / (N - 1)) * cW
      const y = pT + (1 - v / maxVal) * cH
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')

  const area = (data: number[], color: string, id: string) => {
    const pts = data.map((v, i) => ({
      x: pL + (i / (N - 1)) * cW,
      y: pT + (1 - v / maxVal) * cH,
    }))
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const close = `L${pts[pts.length-1].x.toFixed(1)},${(pT+cH).toFixed(1)} L${pL},${(pT+cH).toFixed(1)} Z`
    return (
      <g key={id}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} ${close}`} fill={`url(#${id})`} />
        <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} aria-label="Incident trends chart">
      {[0,3,6,9,12].map(v => {
        const y = pT + (1 - v / maxVal) * cH
        return <line key={v} x1={pL} y1={y} x2={W - pR} y2={y}
          stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" strokeDasharray="2,2" />
      })}
      {area(hasData ? low  : DEMO.low,  C.low,      'a-low')}
      {area(hasData ? med  : DEMO.med,  C.medium,   'a-med')}
      {area(hasData ? high : DEMO.high, C.high,     'a-high')}
      {area(hasData ? crit : DEMO.crit, C.critical, 'a-crit')}
      {labels.map((h, i) => (
        <text key={h} x={pL + (i / (N-1)) * cW} y={H - 4}
          fontSize="6" fill={C.muted} textAnchor="middle" fontFamily="JetBrains Mono, monospace">{h}</text>
      ))}
    </svg>
  )
}

// ─── Donut chart — real type breakdown ────────────────────────────────────────
function DonutChart({ incidents }: { incidents: IncidentResponse[] }) {
  const TYPES = ['FIRE','MEDICAL','ACCIDENT','POLICE','OTHER']
  const COLORS = [C.critical, C.high, C.medium, C.blue, C.muted]
  const total = incidents.length || 1
  const counts = TYPES.map(t => incidents.filter(i => i.type === t || (t === 'OTHER' && !['FIRE','MEDICAL','ACCIDENT','POLICE'].includes(i.type ?? ''))).length)
  const pcts = counts.map(c => Math.round((c / total) * 100))

  const R = 38, CX = 50, CY = 50
  const circ = 2 * Math.PI * R
  let offset = 0

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <svg viewBox="0 0 100 100" style={{ width: 88, height: 88, flexShrink: 0 }} aria-label="Incident type breakdown">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
        {TYPES.map((t, i) => {
          const pct = pcts[i] || 0
          const dash = (pct / 100) * circ
          const gap = circ - dash
          const rot = (offset / 100) * 360 - 90
          const el = (
            <circle key={t} cx={CX} cy={CY} r={R} fill="none"
              stroke={COLORS[i]} strokeWidth="12"
              strokeDasharray={`${dash.toFixed(2)} ${gap.toFixed(2)}`}
              strokeDashoffset="0"
              transform={`rotate(${rot},${CX},${CY})`}
              strokeLinecap="butt" />
          )
          offset += pct
          return el
        })}
        <text x={CX} y={CY - 4} textAnchor="middle" fill={C.text} fontSize="14" fontWeight="bold" fontFamily="JetBrains Mono, monospace">{incidents.length}</text>
        <text x={CX} y={CY + 8} textAnchor="middle" fill={C.muted} fontSize="6" fontFamily="Space Grotesk, sans-serif">Total</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        {TYPES.map((t, i) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i], flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 11, color: C.dimmed, fontFamily: 'Space Grotesk, sans-serif' }}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </span>
            <span style={{ fontSize: 11, color: C.text, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{counts[i]}</span>
            <span style={{ fontSize: 10, color: C.muted, fontFamily: 'JetBrains Mono, monospace' }}>{pcts[i]}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Activity feed item ───────────────────────────────────────────────────────
function activityColor(type: string): string {
  if (type.includes('created')) return C.purple
  if (type.includes('critical') || type.includes('resolved')) return C.critical
  if (type.includes('dispatched') || type.includes('assigned')) return C.medium
  if (type.includes('updated') || type.includes('triaged')) return C.blue
  if (type.includes('responder')) return C.high
  return C.muted
}

function activityText(type: string, payload: unknown): string {
  const p = payload as Record<string, unknown> | null
  const ref = (p?.reference_number ?? p?.incident_id ?? '') as string
  const unit = (p?.unit_id ?? p?.responder_id ?? '') as string
  const sev = (p?.severity ?? '') as string
  switch (type) {
    case 'incident.created':   return `New incident received${ref ? ` — ${ref}` : ''}`
    case 'incident.triaged':   return `Incident triaged${sev ? ` — ${sev}` : ''}${ref ? ` · ${ref}` : ''}`
    case 'incident.dispatched':return `Responders dispatched${ref ? ` to ${ref}` : ''}`
    case 'incident.resolved':  return `Incident resolved${ref ? ` — ${ref}` : ''}`
    case 'incident.updated':   return `Incident updated${ref ? ` — ${ref}` : ''}`
    case 'responder.updated':  return `${unit || 'Responder'} status updated`
    case 'responder.assigned': return `${unit || 'Responder'} assigned${ref ? ` to ${ref}` : ''}`
    default: return type.replace(/\./g, ' ').replace(/_/g, ' ')
  }
}

// ─── New Incident Modal ───────────────────────────────────────────────────────
function NewIncidentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ description: '', location_text: '', type: '', severity: '' })
  const [error, setError] = useState('')

  const mut = useMutation({
    mutationFn: () => incidentsApi.create({
      description: form.description,
      location_text: form.location_text || undefined,
      incident_type: form.type || undefined,
      severity: form.severity || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const F = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border2}`,
    borderRadius: 6, color: C.text, fontSize: 13,
    fontFamily: "'Space Grotesk', sans-serif", outline: 'none',
  }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6, display: 'block', letterSpacing: '0.05em' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true" aria-labelledby="modal-title"
    >
      <div style={{ background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 10, width: 480, maxWidth: '95vw', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(232,68,44,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚠</span>
            <div>
              <div id="modal-title" style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Create New Incident</div>
              <div style={{ fontSize: 11, color: C.muted }}>Manual incident entry — operator created</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }} aria-label="Close modal">✕</button>
        </div>
        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle} htmlFor="inc-desc">DESCRIPTION *</label>
            <textarea
              id="inc-desc" value={form.description} onChange={F('description')} rows={3}
              placeholder="Describe the emergency..."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="inc-loc">LOCATION</label>
            <input id="inc-loc" value={form.location_text} onChange={F('location_text')}
              placeholder="e.g. 122 Main Street, New Delhi"
              style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="inc-type">TYPE</label>
              <select id="inc-type" value={form.type} onChange={F('type')} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Auto-classify</option>
                <option value="FIRE">Fire</option>
                <option value="MEDICAL">Medical</option>
                <option value="POLICE">Police</option>
                <option value="ACCIDENT">Accident</option>
                <option value="NATURAL_DISASTER">Natural Disaster</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="inc-sev">SEVERITY</label>
              <select id="inc-sev" value={form.severity} onChange={F('severity')} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Auto-assess</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>
          {error && (
            <div style={{ background: 'rgba(232,68,44,0.1)', border: `1px solid ${C.critical}44`, borderRadius: 6, padding: '10px 14px', fontSize: 12, color: C.critical }}>
              {error}
            </div>
          )}
        </div>
        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 6,
            color: C.muted, padding: '9px 20px', fontSize: 13, cursor: 'pointer',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>Cancel</button>
          <button
            onClick={() => { if (!form.description.trim()) { setError('Description is required'); return } mut.mutate() }}
            disabled={mut.isPending}
            style={{
              background: C.critical, border: 'none', borderRadius: 6,
              color: '#fff', padding: '9px 20px', fontSize: 13, fontWeight: 700,
              cursor: mut.isPending ? 'wait' : 'pointer',
              fontFamily: "'Space Grotesk', sans-serif",
              opacity: mut.isPending ? 0.7 : 1,
            }}
          >
            {mut.isPending ? 'Creating…' : 'Create Incident'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── NAV ITEMS ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'overview',   label: 'Overview',   icon: '⊞', route: '/operator' },
  { id: 'incidents',  label: 'Incidents',  icon: '⚠', route: '/operator/incidents' },
  { id: 'responders', label: 'Responders', icon: '👥', route: '/operator/responders' },
  { id: 'map',        label: 'Map',        icon: '🗺', route: null },
  { id: 'activity',   label: 'Activity',   icon: '◎', route: '/operator/activity' },
  { id: 'reports',    label: 'Reports',    icon: '📋', route: null },
  { id: 'analytics',  label: 'Analytics',  icon: '📈', route: null },
  { id: 'settings',   label: 'Settings',   icon: '⚙', route: null },
]
const RESP_TABS = [
  { label: 'All',     type: null },
  { label: 'Fire',    type: 'FIRE' },
  { label: 'Medical', type: 'MEDICAL' },
  { label: 'Police',  type: 'POLICE' },
  { label: 'Other',   type: 'HAZMAT' },
]

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function MissionControlPage() {
  useEventSocket() // initialise WS + populate store

  const navigate = useNavigate()
  const qc = useQueryClient()

  // Store
  const {
    incidents: storeInc, responders: storeResp,
    activity, notifications, markAllRead, connectionStatus,
  } = useMissionControlStore()

  const unread = notifications.filter(n => !n.read).length

  // UI state
  const [activeNav, setActiveNav]     = useState('overview')
  const [respTab, setRespTab]         = useState(0)
  const [searchVal, setSearchVal]     = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [showNotif, setShowNotif]     = useState(false)
  const searchRef                     = useRef<HTMLInputElement>(null)

  // Ctrl-K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── API queries ──────────────────────────────────────────────────────────
  const { data: apiInc = [], isLoading: incLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn:  () => incidentsApi.list({ limit: 100 }),
    refetchInterval: 5_000,  // Poll every 5s as a safety net
  })

  const { data: apiResp = [], isLoading: respLoading } = useQuery({
    queryKey: ['responders'],
    queryFn:  () => respondersApi.list(),
    refetchInterval: 10_000,
  })

  // Seed the store ONCE: only when API data first arrives AND store is still empty
  // After that, WS upsertIncident keeps it live. Never write [] back to the store.
  useEffect(() => {
    const inc = apiInc as IncidentResponse[]
    if (inc.length > 0 && useMissionControlStore.getState().incidents.length === 0) {
      useMissionControlStore.getState().setIncidents(inc)
    }
  }, [apiInc])   // safe: only triggers when React Query gets fresh data

  useEffect(() => {
    const resp = apiResp as ResponderResponse[]
    if (resp.length > 0 && useMissionControlStore.getState().responders.length === 0) {
      useMissionControlStore.getState().setResponders(resp)
    }
  }, [apiResp])

  // On any WS incident/responder event → immediately re-fetch API (belt-and-suspenders)
  useEffect(() => {
    const unsub = eventSocket.onEvent((msg) => {
      const type = (msg as { type: string }).type
      if (type.startsWith('incident.') || type.startsWith('responder.')) {
        qc.invalidateQueries({ queryKey: ['incidents'] })
        qc.invalidateQueries({ queryKey: ['responders'] })
      }
    })
    return () => { unsub() }
  }, [qc])

  // Final data: store (WS-live) + any API items not yet in store, merged & sorted
  const storeIds = new Set(storeInc.map(i => i.id))
  const apiOnlyInc = (apiInc as IncidentResponse[]).filter(i => !storeIds.has(i.id))
  const allInc: IncidentResponse[] = [...storeInc, ...apiOnlyInc]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const storeRespIds = new Set(storeResp.map(r => r.id))
  const apiOnlyResp = (apiResp as ResponderResponse[]).filter(r => !storeRespIds.has(r.id))
  const allResp: ResponderResponse[] = [...storeResp, ...apiOnlyResp]




  // ── Derived stats ─────────────────────────────────────────────────────────
  const active     = allInc.filter(i => !['RESOLVED','CLOSED'].includes(i.status))
  const critical   = active.filter(i => i.severity === 'CRITICAL')
  const high       = active.filter(i => i.severity === 'HIGH')
  const medium     = active.filter(i => i.severity === 'MEDIUM')
  const low        = active.filter(i => i.severity === 'LOW')
  const available  = allResp.filter(r => r.status === 'AVAILABLE')

  // avg response time (triaged_at - created_at)
  const triaged = allInc.filter(i => i.triaged_at)
  const avgResp = triaged.length > 0
    ? (triaged.reduce((s, i) => s + (new Date(i.triaged_at!).getTime() - new Date(i.created_at).getTime()), 0) / triaged.length / 60000)
    : 0

  // Recent incidents — sorted newest first
  const recentInc = [...allInc]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8)

  // Critical incidents for bottom panel
  const critInc = [...allInc].filter(i => i.severity === 'CRITICAL').slice(0, 3)

  // Filtered responders
  const filteredResp = allResp.filter(r => {
    const tab = RESP_TABS[respTab]
    if (!tab.type) return true
    if (respTab === 4) return !['FIRE','MEDICAL','POLICE'].includes(r.responder_type)
    return r.responder_type === tab.type
  })

  // ── Search filter ──────────────────────────────────────────────────────────
  const q = searchVal.toLowerCase().trim()
  const displayInc = q
    ? recentInc.filter(i =>
        i.reference_number.toLowerCase().includes(q) ||
        (i.location_text ?? '').toLowerCase().includes(q) ||
        (i.address_resolved ?? '').toLowerCase().includes(q) ||
        (i.type ?? '').toLowerCase().includes(q)
      )
    : recentInc

  // Status pill color
  const wsColor = connectionStatus === 'CONNECTED' ? C.low : connectionStatus === 'CONNECTING' || connectionStatus === 'RECONNECTING' ? C.medium : C.critical
  const wsLabel = connectionStatus === 'CONNECTED' ? 'System Operational' : connectionStatus === 'RECONNECTING' ? 'Reconnecting…' : connectionStatus === 'CONNECTING' ? 'Connecting…' : 'Disconnected'

  const gradients: Record<string, string> = {
    FIRE: 'linear-gradient(135deg,#4a1a0a,#8B2012)',
    MEDICAL: 'linear-gradient(135deg,#0a2a3a,#0D5050)',
    ACCIDENT: 'linear-gradient(135deg,#1a1a0a,#4B4012)',
    POLICE: 'linear-gradient(135deg,#0a0a3a,#0D0D60)',
  }

  // ── STAT RAIL data (live) ─────────────────────────────────────────────────
  const STATS = [
    { label: 'Total Incidents', val: String(allInc.length), color: C.blue,     icon: '▦' },
    { label: 'Critical',        val: String(critical.length), color: C.critical, icon: '⚠' },
    { label: 'High',            val: String(high.length),     color: C.high,     icon: '🔥' },
    { label: 'Medium',          val: String(medium.length),   color: C.medium,   icon: '△' },
    { label: 'Low',             val: String(low.length),      color: C.low,      icon: '●' },
    { label: 'Avg Response',    val: avgResp > 0 ? `${avgResp.toFixed(1)}m` : '—', color: C.blue, icon: '⏱' },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes vigil-pulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 currentColor} 70%{box-shadow:0 0 0 5px transparent} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
        select option { background: #1a2030; color: #E2E8F0; }
      `}</style>

      {showModal && <NewIncidentModal onClose={() => setShowModal(false)} />}

      <div style={{
        display: 'flex', height: '100vh', background: C.bg,
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
        color: C.text, overflow: 'hidden',
      }}>

        {/* ── SIDEBAR — shared component ───────────────────────────────── */}
        <VIGILSidebar />

        {/* ── MAIN AREA ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* ── TOP BAR ──────────────────────────────────────────────────── */}
          <header style={{
            height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
            padding: '0 14px', borderBottom: `1px solid ${C.border}`, background: C.panel,
          }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: C.muted, pointerEvents: 'none' }}>🔍</span>
              <input
                ref={searchRef} type="search" value={searchVal}
                onChange={e => setSearchVal(e.target.value)}
                placeholder="Search incidents, locations, responders..."
                aria-label="Search incidents, locations, responders"
                style={{
                  width: '100%', padding: '7px 80px 7px 30px',
                  background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.text, fontSize: 12, outline: 'none',
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
                onFocus={e => (e.target.style.borderColor = C.blue)}
                onBlur={e => (e.target.style.borderColor = C.border)}
              />
              <span style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                fontSize: 9, color: C.muted, background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${C.border}`, borderRadius: 3, padding: '2px 5px',
                fontFamily: 'JetBrains Mono, monospace',
              }}>Ctrl K</span>
            </div>

            {/* Right section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
              {/* WS status pill */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: wsColor + '18', border: `1px solid ${wsColor}44`,
                borderRadius: 20, padding: '4px 10px',
              }}>
                <PulseDot color={wsColor} />
                <span style={{ fontSize: 11, color: wsColor, fontWeight: 600 }}>{wsLabel}</span>
              </div>

              <LiveClock />

              {/* Notification bell */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => { setShowNotif(v => !v); markAllRead() }}
                  aria-label={`${unread} unread notifications`}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
                    borderRadius: 6, width: 34, height: 34, fontSize: 14, cursor: 'pointer',
                    color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >🔔
                  {unread > 0 && (
                    <span style={{
                      position: 'absolute', top: -4, right: -4, width: 16, height: 16,
                      borderRadius: '50%', background: C.critical,
                      fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 800, border: `2px solid ${C.bg}`,
                    }}>{unread > 9 ? '9+' : unread}</span>
                  )}
                </button>
                {/* Notification dropdown */}
                {showNotif && (
                  <div style={{
                    position: 'absolute', top: 42, right: 0, width: 320, zIndex: 100,
                    background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 8,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden',
                  }}>
                    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 13 }}>Notifications</div>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                      {notifications.length === 0 ? (
                        <div style={{ padding: '20px 14px', textAlign: 'center', color: C.muted, fontSize: 13 }}>No notifications</div>
                      ) : notifications.slice(0, 10).map(n => (
                        <div key={n.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: n.level === 'critical' ? C.critical : n.level === 'warning' ? C.high : C.blue, flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, fontSize: 12, color: C.text }}>{n.title}</span>
                            <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>{timeAgo(n.timestamp)}</span>
                          </div>
                          <div style={{ fontSize: 11, color: C.dimmed, paddingLeft: 14 }}>{n.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Avatar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#3B5998,#4E8FB5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: '#fff',
                }}>JD</div>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>John Doe</div>
                  <div style={{ fontSize: 10, color: C.muted }}>Operator</div>
                </div>
              </div>
            </div>
          </header>

          {/* ── SCROLLABLE CONTENT ────────────────────────────────────────── */}
          <main
            style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}
            onClick={() => showNotif && setShowNotif(false)}
          >

            {/* ── STAT RAIL ──────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {STATS.map((s, i) => (
                <div key={s.label} style={{
                  background: C.panel, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '10px 14px',
                  borderTop: `2px solid ${s.color}44`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>{s.icon}</span>
                    {(incLoading || respLoading) && i === 0 && (
                      <span style={{ fontSize: 10, color: C.muted, animation: 'spin 1s linear infinite' }}>↻</span>
                    )}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1, marginBottom: 3, fontFamily: 'JetBrains Mono, monospace' }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* ── THREE COLUMN ROW ─────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.05fr 1fr', gap: 10, minHeight: 350 }}>

              {/* Live Map */}
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Live Incident Map</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: 'JetBrains Mono, monospace' }}>{active.length} active pins</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(232,68,44,0.1)', border: `1px solid ${C.critical}44`, borderRadius: 20, padding: '3px 8px' }}>
                      <PulseDot color={C.critical} />
                      <span style={{ fontSize: 10, color: C.critical, fontWeight: 700 }}>Live</span>
                    </div>
                  </div>
                </div>
                <LeafletMap incidents={active} />
              </div>

              {/* Recent Incidents */}
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Recent Incidents</div>
                  <button onClick={() => navigate('/operator/incidents')}
                    style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" }}>
                    View All →
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {incLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: C.muted, fontSize: 13 }}>Loading…</div>
                  ) : displayInc.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, gap: 8 }}>
                      <span style={{ fontSize: 24 }}>🛡️</span>
                      <span style={{ fontSize: 12, color: C.muted }}>{q ? 'No matches found' : 'No incidents yet'}</span>
                    </div>
                  ) : displayInc.map((inc, i) => (
                    <button key={inc.id}
                      onClick={() => navigate(`/operator/incidents/${inc.id}`)}
                      style={{
                        width: '100%', textAlign: 'left', border: 'none',
                        borderBottom: i < displayInc.length - 1 ? `1px solid ${C.border}` : 'none',
                        background: 'transparent', cursor: 'pointer', padding: '9px 14px',
                        display: 'flex', alignItems: 'center', gap: 9,
                      }}
                      onMouseOver={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'}
                      onMouseOut={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                    >
                      <span style={{
                        width: 28, height: 28, borderRadius: 5, flexShrink: 0,
                        background: SEV_BG[inc.severity ?? ''] ?? 'rgba(100,116,139,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                      }}>
                        {inc.type ? (INCIDENT_TYPE_ICON[inc.type] ?? '⚠️') : '⚠️'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                          <span style={{ fontSize: 10, color: C.blue, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                            {inc.reference_number}
                          </span>
                          <IncStatusChip status={inc.status} />
                        </div>
                        <div style={{ fontSize: 11, color: C.dimmed, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {inc.address_resolved ?? inc.location_text ?? 'Location unknown'}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: 'JetBrains Mono, monospace' }}>
                          {timeAgo(inc.created_at)} · {inc.type ?? 'Unknown'}
                        </div>
                      </div>
                      <SevChip sev={inc.severity} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Activity Feed */}
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Live Activity Feed</div>
                  <button onClick={() => navigate('/operator/activity')}
                    style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" }}>
                    All Activity
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 30, top: 12, bottom: 12, width: 1, background: 'rgba(78,143,181,0.12)' }} aria-hidden="true" />
                  {activity.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 100, gap: 8 }}>
                      <PulseDot color={C.muted} />
                      <span style={{ fontSize: 11, color: C.muted }}>Waiting for events…</span>
                    </div>
                  ) : activity.slice(0, 12).map((ev, i) => {
                    const col = activityColor(ev.type)
                    const text = activityText(ev.type, ev.payload)
                    const ts = new Date(ev.timestamp).toTimeString().slice(0, 5)
                    return (
                      <div key={ev.id} style={{ display: 'grid', gridTemplateColumns: '36px 12px 1fr', gap: 7, marginBottom: 12, alignItems: 'start' }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: C.muted, textAlign: 'right', paddingTop: 2 }}>{ts}</span>
                        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4, position: 'relative', zIndex: 1 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, display: 'block', boxShadow: `0 0 5px ${col}66`, flexShrink: 0 }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'rgba(226,232,240,0.75)', lineHeight: 1.5 }}>{text}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── BOTTOM ROW ───────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr', gap: 10 }}>

              {/* Responder Status */}
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Responder Status</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: C.low }}>{available.length} available</span>
                    <button onClick={() => navigate('/operator/responders')}
                      style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" }}>
                      View All →
                    </button>
                  </div>
                </div>
                {/* Filter tabs */}
                <div style={{ display: 'flex', gap: 4, padding: '7px 14px', borderBottom: `1px solid ${C.border}` }}>
                  {RESP_TABS.map((tab, i) => {
                    const count = i === 0 ? allResp.length
                      : allResp.filter(r => tab.type ? r.responder_type === tab.type : !['FIRE','MEDICAL','POLICE'].includes(r.responder_type)).length
                    return (
                      <button key={tab.label} onClick={() => setRespTab(i)}
                        style={{
                          padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                          fontSize: 10, fontWeight: 600,
                          background: respTab === i ? 'rgba(78,143,181,0.2)' : 'transparent',
                          color: respTab === i ? C.blue : C.muted,
                          fontFamily: "'Space Grotesk', sans-serif",
                        }}>
                        {tab.label} ({count})
                      </button>
                    )
                  })}
                </div>
                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Responder status table">
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                        {['Responder', 'Type', 'Status', 'Location'].map(h => (
                          <th key={h} style={{ padding: '6px 14px', fontSize: 9, color: C.muted, fontWeight: 700, textAlign: 'left', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {respLoading ? (
                        <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: C.muted, fontSize: 12 }}>Loading responders…</td></tr>
                      ) : filteredResp.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: C.muted, fontSize: 12 }}>No responders found</td></tr>
                      ) : filteredResp.map(r => (
                        <tr key={r.id} style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}
                          onClick={() => navigate('/operator/responders')}
                          onMouseOver={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.03)'}
                          onMouseOut={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                        >
                          <td style={{ padding: '9px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                width: 24, height: 24, borderRadius: 4, flexShrink: 0,
                                background: r.responder_type === 'FIRE' ? 'rgba(232,68,44,0.15)' : r.responder_type === 'MEDICAL' ? 'rgba(232,129,60,0.15)' : 'rgba(78,143,181,0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                              }}>
                                {RESPONDER_TYPE_ICON[r.responder_type] ?? '🚨'}
                              </span>
                              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600, color: C.text }}>{r.unit_id}</span>
                            </div>
                          </td>
                          <td style={{ padding: '9px 14px', fontSize: 11, color: C.muted }}>{r.responder_type}</td>
                          <td style={{ padding: '9px 14px' }}><StatusChip status={r.status} /></td>
                          <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: C.muted }}>
                            {r.latitude && r.longitude
                              ? `${r.latitude.toFixed(3)}°, ${r.longitude.toFixed(3)}°`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Incident Trends */}
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Incident Trends</div>
                  <span style={{ fontSize: 10, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 8px' }}>Last 24 hours</span>
                </div>
                <div style={{ padding: '8px 10px 4px', flex: 1 }}>
                  <TrendChart incidents={allInc} />
                </div>
                <div style={{ padding: '6px 14px 10px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[['Critical',C.critical],['High',C.high],['Medium',C.medium],['Low',C.low]].map(([l,col]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 10, height: 3, borderRadius: 2, background: col, display: 'inline-block' }} />
                      <span style={{ fontSize: 10, color: C.muted }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Incident Types + Critical Incidents */}
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Incident Types</div>
                  <DonutChart incidents={allInc} />
                </div>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>Critical Incidents</div>
                  <button onClick={() => navigate('/operator/incidents')}
                    style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" }}>
                    View All →
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {critInc.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 80, gap: 6 }}>
                      <span style={{ fontSize: 20 }}>🛡️</span>
                      <span style={{ fontSize: 11, color: C.muted }}>No critical incidents</span>
                    </div>
                  ) : critInc.map(inc => (
                    <button key={inc.id}
                      onClick={() => navigate(`/operator/incidents/${inc.id}`)}
                      style={{
                        display: 'flex', gap: 10, alignItems: 'center',
                        background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
                        borderRadius: 6, padding: '7px', cursor: 'pointer', textAlign: 'left',
                        width: '100%',
                      }}
                      onMouseOver={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'}
                      onMouseOut={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'}
                    >
                      <div style={{
                        width: 46, height: 38, borderRadius: 4, flexShrink: 0,
                        background: gradients[inc.type ?? ''] ?? 'linear-gradient(135deg,#1a1a2a,#2a2a4a)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                      }}>
                        {inc.type ? (INCIDENT_TYPE_ICON[inc.type] ?? '⚠️') : '⚠️'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: C.blue, fontWeight: 600 }}>
                            {inc.reference_number}
                          </span>
                          <span style={{ background: 'rgba(232,68,44,0.2)', color: C.critical, border: `1px solid ${C.critical}44`, borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>CRITICAL</span>
                        </div>
                        <div style={{ fontSize: 10, color: C.dimmed, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                          {inc.address_resolved ?? inc.location_text ?? 'Location unknown'}
                        </div>
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: 'JetBrains Mono, monospace' }}>{timeAgo(inc.created_at)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Spacer for FAB */}
            <div style={{ height: 20 }} />
          </main>

          {/* ── FAB ──────────────────────────────────────────────────────── */}
          <button
            onClick={() => setShowModal(true)}
            aria-label="Create new incident"
            style={{
              position: 'fixed', bottom: 24, left: 224,
              background: C.critical, color: '#fff', border: 'none', borderRadius: 24,
              padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: `0 4px 24px ${C.critical}55`,
              fontFamily: "'Space Grotesk', sans-serif", zIndex: 50,
            }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)' }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>+</span>
            New Incident
          </button>
        </div>
      </div>
    </>
  )
}
