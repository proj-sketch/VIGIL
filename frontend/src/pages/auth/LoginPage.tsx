// pages/auth/LoginPage.tsx
// Auth shell — backend has no /auth endpoint yet.
// Isolates auth logic here so it can be wired when backend auth is added.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // TODO: Wire to real backend auth endpoint when available
      // For now: accept any non-empty credentials and navigate to operator
      if (!email || !password) {
        setError('Please enter your email and password.')
        setLoading(false)
        return
      }
      // Simulated auth boundary — replace with real API call
      await new Promise(r => setTimeout(r, 400))
      navigate('/operator')
    } catch {
      setError('Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080d18] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 mb-5">
            <ShieldAlert className="w-7 h-7 text-red-400" aria-hidden="true" />
          </div>
          <h1 className="text-white text-2xl font-black">RAPID HELP</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium tracking-wider">MISSION CONTROL</p>
        </div>

        {/* Card */}
        <div className="bg-[#141c33] border border-white/[0.07] rounded-2xl p-7 animate-fade-in-up shadow-2xl" style={{ animationDelay: '0.05s' }}>
          <h2 className="text-white font-bold text-lg mb-1">Sign in</h2>
          <p className="text-slate-500 text-sm mb-6">Access the emergency operations center</p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-slate-400 text-xs font-semibold mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-[#0f1629] border border-white/[0.07] rounded-xl text-white text-sm placeholder-slate-700 focus:outline-none focus:border-blue-500/40 focus:bg-[#0f1629] transition-colors"
                placeholder="operator@example.com"
                aria-required="true"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-slate-400 text-xs font-semibold mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 pr-11 bg-[#0f1629] border border-white/[0.07] rounded-xl text-white text-sm placeholder-slate-700 focus:outline-none focus:border-blue-500/40 transition-colors"
                  placeholder="••••••••"
                  aria-required="true"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3" role="alert">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all duration-200 shadow-[0_4px_16px_rgba(59,130,246,0.25)] hover:shadow-[0_4px_24px_rgba(59,130,246,0.4)] disabled:opacity-60 disabled:cursor-wait focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Auth isolation note */}
        <p className="text-slate-700 text-[10px] text-center mt-6">
          Authentication shell — connect backend auth endpoint to activate
        </p>
      </div>
    </div>
  )
}
