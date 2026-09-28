// components/layout/VIGILSidebar.tsx
// Shared sidebar for all operator pages — same design as Operation Control
import { useLocation, useNavigate } from 'react-router-dom'
import { useMissionControlStore } from '../../stores/missionControlStore'

const C = {
  panel: '#10151D',
  border: 'rgba(255,255,255,0.06)',
  blue: '#4E8FB5',
  critical: '#E8442C',
  low: '#4CAF6D',
  medium: '#E0C22E',
  muted: '#64748B',
  text: '#E2E8F0',
} as const

const NAV_ITEMS = [
  { id: 'overview',   label: 'Overview',   icon: '⊞', route: '/operator',            exact: true },
  { id: 'incidents',  label: 'Incidents',  icon: '⚠', route: '/operator/incidents',  exact: false },
  { id: 'responders', label: 'Responders', icon: '👥', route: '/operator/responders', exact: false },
  { id: 'map',        label: 'Map',        icon: '🗺', route: null,                   exact: false },
  { id: 'activity',   label: 'Activity',   icon: '◎', route: '/operator/activity',   exact: false },
  { id: 'reports',    label: 'Reports',    icon: '📋', route: null,                   exact: false },
  { id: 'analytics',  label: 'Analytics',  icon: '📈', route: null,                   exact: false },
  { id: 'settings',   label: 'Settings',   icon: '⚙', route: null,                   exact: false },
]

function PulseDot({ color = C.low }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: color, flexShrink: 0,
      animation: 'vigil-pulse 2s infinite',
    }} aria-hidden="true" />
  )
}

export function VIGILSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { connectionStatus, notifications } = useMissionControlStore()
  const criticalCount = useMissionControlStore(s => s.incidents.filter(i => i.severity === 'CRITICAL' && !['RESOLVED','CLOSED'].includes(i.status)).length)
  const wsColor = connectionStatus === 'CONNECTED' ? C.low : connectionStatus === 'RECONNECTING' ? C.medium : C.critical

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes vigil-pulse { 0%,100%{opacity:1} 70%{opacity:0.7} }
      `}</style>
      <aside style={{
        width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: C.panel, borderRight: `1px solid ${C.border}`, zIndex: 10,
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
      }}>
        {/* Logo */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <polygon points="14,2 26,22 2,22" fill="none" stroke={C.blue} strokeWidth="2"/>
            <circle cx="14" cy="17" r="2.5" fill={C.critical}/>
            <line x1="14" y1="7" x2="14" y2="14" stroke={C.critical} strokeWidth="1.5"/>
          </svg>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>VIGIL</div>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: '0.12em', fontFamily: 'JetBrains Mono, monospace' }}>OPERATION CONTROL</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px', overflowY: 'auto' }} aria-label="Operator navigation">
          {NAV_ITEMS.map(item => {
            const isActive = item.exact
              ? location.pathname === item.route
              : item.route !== null && location.pathname.startsWith(item.route)

            const badge = item.id === 'incidents' && criticalCount > 0 ? criticalCount : 0

            return (
              <button
                key={item.id}
                onClick={() => { if (item.route) navigate(item.route) }}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.route ? `Navigate to ${item.label}` : `${item.label} (coming soon)`}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 10px', borderRadius: 6, border: 'none',
                  borderLeft: isActive ? `3px solid ${C.blue}` : '3px solid transparent',
                  background: isActive ? 'rgba(78,143,181,0.13)' : 'transparent',
                  color: isActive ? C.blue : item.route ? C.muted : 'rgba(100,116,139,0.4)',
                  cursor: item.route ? 'pointer' : 'default',
                  fontSize: 13, fontWeight: isActive ? 600 : 400,
                  marginBottom: 1, textAlign: 'left',
                  fontFamily: "'Space Grotesk', sans-serif",
                  transition: 'all 0.12s',
                }}
                onMouseOver={e => {
                  if (!isActive && item.route)
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseOut={e => {
                  if (!isActive)
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                }}
              >
                <span style={{ fontSize: 13, width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {badge > 0 && (
                  <span style={{
                    background: C.critical, color: '#fff',
                    borderRadius: 10, fontSize: 9, fontWeight: 700,
                    padding: '1px 5px', minWidth: 16, textAlign: 'center',
                  }}>{badge}</span>
                )}
                {!item.route && (
                  <span style={{ fontSize: 8, color: 'rgba(100,116,139,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>SOON</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Weather + System Status */}
        <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>🌤</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>28°C</div>
              <div style={{ fontSize: 10, color: C.muted }}>Partly Cloudy · Delhi</div>
            </div>
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>
            System Status
          </div>
          {['API Services','Voice Service','Database','Webhook Server','AI Models'].map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <PulseDot color={wsColor} />
              <span style={{ fontSize: 10, color: C.muted }}>{s}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 9, color: 'rgba(100,116,139,0.35)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.5 }}>
            VIGIL v1.0.0<br />Hear. Understand. Respond.
          </div>
        </div>
      </aside>
    </>
  )
}
