// app/router.tsx
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { OperatorLayout } from '../components/layout/OperatorLayout'

// Landing page — eager (marketing critical path)
import LandingPage from '../pages/LandingPage'

// Citizen — eager (critical path)
import EmergencyPage from '../pages/citizen/EmergencyPage'
import VoiceSessionPage from '../pages/citizen/VoiceSessionPage'
import IncidentStatusPage from '../pages/citizen/IncidentStatusPage'

// Operator — lazy loaded
const MissionControlPage = lazy(() => import('../pages/operator/MissionControlPage'))
const IncidentListPage = lazy(() => import('../pages/operator/IncidentListPage'))
const IncidentDetailsPage = lazy(() => import('../pages/operator/IncidentDetailsPage'))
const RespondersPage = lazy(() => import('../pages/operator/RespondersPage'))
const ActivityPage = lazy(() => import('../pages/operator/ActivityPage'))

function OperatorFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <svg className="w-7 h-7 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page */}
        <Route path="/" element={<LandingPage />} />

        {/* Citizen routes */}
        <Route path="/emergency" element={<EmergencyPage />} />
        <Route path="/emergency/session" element={<VoiceSessionPage />} />
        <Route path="/emergency/status/:id" element={<IncidentStatusPage />} />

        {/* Operator routes — lazy */}
        <Route
          path="/operator"
          element={
            <Suspense fallback={<OperatorFallback />}>
              <OperatorLayout />
            </Suspense>
          }
        >
          <Route index element={<MissionControlPage />} />
          <Route path="incidents" element={<IncidentListPage />} />
          <Route path="incidents/:id" element={<IncidentDetailsPage />} />
          <Route path="responders" element={<RespondersPage />} />
          <Route path="activity" element={<ActivityPage />} />
        </Route>

        {/* Fallback — return to landing */}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  )
}
