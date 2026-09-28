// components/layout/OperatorLayout.tsx
// Wraps sub-pages (incidents, responders, activity) with the shared VIGIL chrome.
// MissionControlPage (root /operator) renders its own full-screen layout and
// is passed through without wrapping.

import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { VIGILSidebar } from './VIGILSidebar'
import { NotificationToast, useAutoDismiss } from '../ui/NotificationToast'
import { useMissionControlStore } from '../../stores/missionControlStore'
import { useEventSocket } from '../../hooks/useEventSocket'
import type { EventSocketStatus } from '../../services/eventSocket'

const C = {
  bg: '#0A0E14', panel: '#10151D',
  border: 'rgba(255,255,255,0.06)',
  blue: '#4E8FB5', critical: '#E8442C',
  low: '#4CAF6D', medium: '#E0C22E',
  muted: '#64748B', text: '#E2E8F0',
} as const

// Page title map
const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/operator/incidents':  { title: 'Incidents',     subtitle: 'All active and historical incidents' },
  '/operator/responders': { title: 'Responders',    subtitle: 'Field unit status and assignments' },
  '/operator/activity':   { title: 'Activity Feed', subtitle: 'Real-time event log' },
  '/operator/reports':    { title: 'Reports',        subtitle: 'Operational summaries and exports' },
  '/operator/analytics':  { title: 'Analytics',      subtitle: 'Trend analysis and metrics' },
  '/operator/settings':   { title: 'Settings',       subtitle: 'System configuration' },
}

function LiveClock() {
  const [now, setNow] = [new Date(), () => {}]
  // Static — updated by useEffect below
  return <span style={{ fontSize: 13, color: C.muted, fontFamily: 'JetBrains Mono, monospace' }}>{new Date().toTimeString().slice(0,8)}</span>
}

export function OperatorLayout() {
  useEventSocket()
  const location = useLocation()
  const navigate = useNavigate()
  const { notifications, markAllRead, connectionStatus } = useMissionControlStore()
  const unreadCount = notifications.filter(n => !n.read).length
  const dismiss = (_id: string) => markAllRead()
  useAutoDismiss(notifications, dismiss, 5000)

  // MissionControlPage owns its own full-screen layout
  const isMissionControl = location.pathname === '/operator'
  if (isMissionControl) {
    return (
      <>
        <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
          <Outlet />
        </div>
        <NotificationToast notifications={notifications} onDismiss={() => markAllRead()} />
      </>
    )
  }

  const pageInfo = PAGE_TITLES[location.pathname] ?? { title: 'Operator', subtitle: '' }
  const wsColor = connectionStatus === 'CONNECTED' ? C.low : connectionStatus === 'RECONNECTING' ? C.medium : C.critical

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes vigil-pulse { 0%,100%{opacity:1} 70%{opacity:0.7} }
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>

      <div style={{
        display: 'flex', height: '100vh',
        background: C.bg,
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
        color: C.text, overflow: 'hidden',
      }}>
        <VIGILSidebar />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Top bar */}
          <header style={{
            height: 52, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 20px', borderBottom: `1px solid ${C.border}`,
            background: C.panel,
          }}>
            {/* Page title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => navigate('/operator')}
                aria-label="Back to Operation Control"
                style={{
                  background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
                  borderRadius: 6, width: 30, height: 30, cursor: 'pointer',
                  color: C.muted, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'sans-serif',
                }}
                onMouseOver={e => (e.currentTarget as HTMLButtonElement).style.color = C.text}
                onMouseOut={e => (e.currentTarget as HTMLButtonElement).style.color = C.muted}
              >←</button>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>{pageInfo.title}</div>
                {pageInfo.subtitle && <div style={{ fontSize: 10, color: C.muted }}>{pageInfo.subtitle}</div>}
              </div>
            </div>

            {/* Right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* WS status pill */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: wsColor + '18', border: `1px solid ${wsColor}44`,
                borderRadius: 20, padding: '4px 10px',
              }}>
                <span style={{
                  display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                  background: wsColor, animation: 'vigil-pulse 2s infinite',
                }} aria-hidden="true" />
                <span style={{ fontSize: 11, color: wsColor, fontWeight: 600 }}>
                  {connectionStatus === 'CONNECTED' ? 'Live' : connectionStatus}
                </span>
              </div>

              {/* Notification bell */}
              <button
                onClick={markAllRead}
                aria-label={`${unreadCount} unread notifications`}
                style={{
                  position: 'relative',
                  background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
                  borderRadius: 6, width: 34, height: 34, fontSize: 14, cursor: 'pointer',
                  color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                🔔
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    width: 16, height: 16, borderRadius: '50%',
                    background: C.critical, border: `2px solid ${C.bg}`,
                    fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 800,
                  }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>

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

          {/* Page content */}
          <main style={{ flex: 1, overflowY: 'auto', background: C.bg }}>
            <Outlet />
          </main>
        </div>
      </div>

      <NotificationToast notifications={notifications} onDismiss={() => markAllRead()} />
    </>
  )
}
