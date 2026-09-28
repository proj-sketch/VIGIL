// pages/LandingPage.tsx
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Animated Waveform ───────────────────────────────────────────────────────
function WaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const timeRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let stopped = false

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = (ts: number) => {
      if (stopped) return
      const dt = ts - timeRef.current
      timeRef.current = ts

      const W = canvas.offsetWidth
      const H = canvas.offsetHeight
      ctx.clearRect(0, 0, W, H)

      const bars = 64
      const barW = W / bars
      const centerY = H / 2
      const t = ts / 1000

      for (let i = 0; i < bars; i++) {
        const x = i * barW + barW / 2
        // Layered sine waves for organic feel
        const amp =
          Math.sin(i * 0.18 + t * 2.1) * 0.4 +
          Math.sin(i * 0.35 + t * 1.3) * 0.3 +
          Math.sin(i * 0.07 + t * 0.8) * 0.2 +
          Math.cos(i * 0.23 + t * 3.2) * 0.1
        const h = Math.max(2, (amp + 1) * 0.5 * (H * 0.78))

        // Dispatch blue gradient
        const alpha = 0.35 + Math.abs(amp) * 0.55
        ctx.fillStyle = `rgba(59, 126, 161, ${alpha})`
        ctx.fillRect(x - barW * 0.3, centerY - h / 2, barW * 0.6, h)
      }

      // Subtle scanline
      ctx.fillStyle = 'rgba(59,126,161,0.04)'
      for (let y = 0; y < H; y += 4) {
        ctx.fillRect(0, y, W, 1)
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      stopped = true
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}

// ─── Live Pulse Dot ───────────────────────────────────────────────────────────
function PulseDot({ color = '#E8442C' }: { color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: color,
          boxShadow: `0 0 0 0 ${color}`,
          display: 'inline-block',
          animation: 'pulse-dot 1.8s infinite',
        }}
      />
    </span>
  )
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <>
      {/* ── Injected global styles ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;0,9..144,900;1,9..144,400&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #0B0D10; }

        .vg-root { font-family: 'Space Grotesk', system-ui, sans-serif; }
        .vg-serif { font-family: 'Fraunces', Georgia, serif; }
        .vg-mono { font-family: 'JetBrains Mono', 'Courier New', monospace; }

        /* Section rhythm */
        .vg-dark  { background: #0B0D10; color: #F5F2EA; }
        .vg-light { background: #F5F2EA; color: #0B0D10; }

        /* Buttons */
        .btn-primary {
          background: #E8442C; color: #fff;
          border: none; border-radius: 3px;
          padding: 14px 32px;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 600; font-size: 15px;
          letter-spacing: 0.02em;
          cursor: pointer; transition: background 0.18s, transform 0.12s;
          text-decoration: none; display: inline-block;
        }
        .btn-primary:hover { background: #c93820; transform: translateY(-1px); }
        .btn-primary:active { transform: translateY(0); }
        .btn-primary:focus-visible { outline: 3px solid #E0A526; outline-offset: 3px; }

        .btn-outline {
          background: transparent;
          color: #3B7EA1; border: 1.5px solid #3B7EA1;
          border-radius: 3px; padding: 13px 30px;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 600; font-size: 15px;
          letter-spacing: 0.02em;
          cursor: pointer; transition: background 0.18s, color 0.18s, transform 0.12s;
          text-decoration: none; display: inline-block;
        }
        .btn-outline:hover { background: #3B7EA1; color: #fff; transform: translateY(-1px); }
        .btn-outline:focus-visible { outline: 3px solid #3B7EA1; outline-offset: 3px; }

        .btn-ghost {
          background: rgba(59,126,161,0.12);
          color: #3B7EA1; border: 1.5px solid rgba(59,126,161,0.35);
          border-radius: 3px; padding: 13px 30px;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 600; font-size: 15px;
          cursor: pointer; transition: background 0.18s, transform 0.12s;
          text-decoration: none; display: inline-block;
        }
        .btn-ghost:hover { background: rgba(59,126,161,0.22); transform: translateY(-1px); }
        .btn-ghost:focus-visible { outline: 3px solid #3B7EA1; outline-offset: 3px; }

        /* Chips */
        .chip-red    { background: #E8442C22; color: #E8442C; border: 1px solid #E8442C55; }
        .chip-amber  { background: #E0A52622; color: #E0A526; border: 1px solid #E0A52655; }
        .chip-blue   { background: #3B7EA122; color: #3B7EA1; border: 1px solid #3B7EA155; }
        .chip-sage   { background: #8FA39622; color: #8FA396; border: 1px solid #8FA39655; }
        .chip {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 11px; font-weight: 600;
          padding: 2px 8px; border-radius: 2px;
          letter-spacing: 0.04em; white-space: nowrap;
        }

        /* Animations */
        @keyframes pulse-dot {
          0%   { box-shadow: 0 0 0 0 currentColor; }
          70%  { box-shadow: 0 0 0 6px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0; }
        }
        @keyframes scroll-x {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .animate-blink { animation: blink 1s step-end infinite; }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition: none !important; }
        }

        /* Responsive nav */
        @media (max-width: 640px) {
          .nav-operator { display: none; }
        }

        /* Console scrollbar */
        .console-scroll::-webkit-scrollbar { width: 4px; }
        .console-scroll::-webkit-scrollbar-track { background: transparent; }
        .console-scroll::-webkit-scrollbar-thumb { background: #3B7EA155; border-radius: 2px; }

        /* Chat bubbles */
        .bubble-caller { background: #3B3A36; color: #F5F2EA; border-radius: 16px 16px 16px 4px; }
        .bubble-vigil  { background: #1B3D4F; color: #A8D4E6; border-radius: 16px 16px 4px 16px; border: 1px solid #3B7EA133; }

        /* Divider rule */
        .hr-dispatch { border: none; border-top: 1px solid rgba(245,242,234,0.12); margin: 0; }
        .hr-dispatch-dark { border: none; border-top: 1px solid rgba(11,13,16,0.12); margin: 0; }

        /* Skip link */
        .skip-link {
          position: absolute; top: -40px; left: 8px;
          background: #E8442C; color: white; padding: 8px 16px;
          border-radius: 2px; font-size: 13px; font-weight: 600;
          text-decoration: none; z-index: 9999;
          transition: top 0.15s;
        }
        .skip-link:focus { top: 8px; }

        /* Section max-width */
        .vg-container { max-width: 1200px; margin: 0 auto; padding: 0 32px; }
        @media (max-width: 640px) { .vg-container { padding: 0 20px; } }
      `}</style>

      <div className="vg-root">
        {/* Skip link */}
        <a href="#main-content" className="skip-link">Skip to content</a>

        {/* ── NAV ─────────────────────────────────────────────────────────── */}
        <nav
          role="navigation"
          aria-label="Main"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
            background: 'rgba(11,13,16,0.92)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(59,126,161,0.15)',
          }}
        >
          <div className="vg-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Logo mark */}
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <polygon points="14,2 26,22 2,22" fill="none" stroke="#3B7EA1" strokeWidth="2"/>
                <circle cx="14" cy="17" r="2.5" fill="#E8442C"/>
                <line x1="14" y1="7" x2="14" y2="14" stroke="#E8442C" strokeWidth="1.5"/>
              </svg>
              <span className="vg-serif" style={{ fontSize: 20, fontWeight: 700, color: '#F5F2EA', letterSpacing: '-0.01em' }}>VIGIL</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <a
                href="#how-it-works"
                style={{ color: '#8FA396', fontSize: 13, fontWeight: 500, textDecoration: 'none', letterSpacing: '0.02em' }}
              >
                How It Works
              </a>
              <a
                href="#operator"
                style={{ color: '#8FA396', fontSize: 13, fontWeight: 500, textDecoration: 'none', letterSpacing: '0.02em' }}
                className="nav-operator"
              >
                Operators
              </a>
              <button
                className="btn-outline"
                style={{ padding: '8px 18px', fontSize: 13 }}
                onClick={() => navigate('/operator')}
                aria-label="Open operator dashboard"
              >
                Operator Dashboard
              </button>
              <button
                className="btn-primary"
                style={{ padding: '8px 18px', fontSize: 13 }}
                onClick={() => navigate('/emergency')}
                aria-label="Report an emergency"
              >
                Get Started
              </button>
            </div>
          </div>
        </nav>

        <main id="main-content">

          {/* ── HERO ─────────────────────────────────────────────────────── */}
          <section
            className="vg-dark"
            aria-labelledby="hero-headline"
            style={{ paddingTop: 120, paddingBottom: 80, minHeight: '92vh', display: 'flex', alignItems: 'center' }}
          >
            <div className="vg-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>

              {/* Left — editorial headline */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
                  <PulseDot color="#E8442C" />
                  <span className="vg-mono" style={{ fontSize: 11, color: '#8FA396', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    System Active
                  </span>
                </div>

                <h1
                  id="hero-headline"
                  className="vg-serif"
                  style={{
                    fontSize: 'clamp(48px, 7vw, 88px)',
                    fontWeight: 900,
                    lineHeight: 1.0,
                    letterSpacing: '-0.02em',
                    color: '#F5F2EA',
                    marginBottom: 16,
                  }}
                >
                  Hear.
                  <br />
                  <span style={{ color: '#3B7EA1' }}>Understand.</span>
                  <br />
                  Respond.
                </h1>

                <p
                  style={{
                    fontSize: 19, lineHeight: 1.6,
                    color: 'rgba(245,242,234,0.7)',
                    maxWidth: 420, marginBottom: 40,
                  }}
                >
                  An AI-powered, voice-first emergency response platform.
                  Because every second matters.
                </p>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <button
                    className="btn-primary"
                    style={{ fontSize: 16, padding: '15px 36px' }}
                    onClick={() => navigate('/emergency')}
                    aria-label="Report an emergency — opens voice session"
                  >
                    Report Emergency
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 16, padding: '15px 36px' }}
                    onClick={() => navigate('/operator')}
                    aria-label="Open operator mission control dashboard"
                  >
                    Mission Control
                  </button>
                </div>

                <div
                  className="vg-mono"
                  style={{
                    marginTop: 48,
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 24, borderTop: '1px solid rgba(59,126,161,0.2)',
                    paddingTop: 28,
                  }}
                >
                  {[
                    { val: '< 2s', label: 'Incident capture' },
                    { val: '24/7', label: 'Always on' },
                    { val: '100%', label: 'Auditable' },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ fontSize: 28, fontWeight: 500, color: '#3B7EA1' }}>{s.val}</div>
                      <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.45)', marginTop: 4, letterSpacing: '0.04em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right — waveform */}
              <div
                style={{
                  position: 'relative',
                  borderRadius: 6,
                  border: '1px solid rgba(59,126,161,0.2)',
                  overflow: 'hidden',
                  background: '#060810',
                }}
              >
                {/* Top bar */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderBottom: '1px solid rgba(59,126,161,0.15)',
                    background: 'rgba(59,126,161,0.06)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PulseDot color="#E8442C" />
                    <span className="vg-mono" style={{ fontSize: 11, color: '#3B7EA1', letterSpacing: '0.08em' }}>LIVE — AUDIO INPUT</span>
                  </div>
                  <span className="vg-mono" style={{ fontSize: 11, color: 'rgba(245,242,234,0.3)' }}>CH-01</span>
                </div>

                {/* Canvas waveform */}
                <div style={{ height: 180 }}>
                  <WaveformCanvas />
                </div>

                {/* Bottom strip */}
                <div
                  style={{
                    padding: '10px 16px',
                    borderTop: '1px solid rgba(59,126,161,0.15)',
                    background: 'rgba(59,126,161,0.04)',
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 8,
                  }}
                >
                  {[
                    { label: 'FREQ', val: '3.2 kHz' },
                    { label: 'LATENCY', val: '~40ms' },
                    { label: 'SIGNAL', val: 'Strong' },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center' }}>
                      <div className="vg-mono" style={{ fontSize: 9, color: 'rgba(245,242,234,0.3)', letterSpacing: '0.08em' }}>{m.label}</div>
                      <div className="vg-mono" style={{ fontSize: 13, color: '#8FA396' }}>{m.val}</div>
                    </div>
                  ))}
                </div>

                {/* Transcript snippet */}
                <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(59,126,161,0.1)' }}>
                  <div className="vg-mono" style={{ fontSize: 12, color: 'rgba(245,242,234,0.35)', marginBottom: 8, letterSpacing: '0.06em' }}>TRANSCRIPT · REAL-TIME</div>
                  <div
                    className="vg-mono"
                    style={{
                      fontSize: 13, lineHeight: 1.7,
                      color: 'rgba(245,242,234,0.75)',
                      borderLeft: '2px solid #E8442C',
                      paddingLeft: 12,
                    }}
                  >
                    <span style={{ color: '#E0A526' }}>Caller:</span> There's a fire in my apartment building—<br />
                    <span style={{ color: '#3B7EA1' }}>VIGIL:</span> Are you still inside the building?<span className="animate-blink" style={{ color: '#3B7EA1' }}>▋</span>
                  </div>
                </div>

                {/* Incident auto-extracted */}
                <div
                  style={{
                    padding: '10px 16px',
                    borderTop: '1px solid rgba(59,126,161,0.1)',
                    background: 'rgba(232,68,44,0.04)',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <span className="chip chip-red">FIRE</span>
                  <span className="chip chip-amber">CLASSIFYING</span>
                  <span className="vg-mono" style={{ fontSize: 11, color: 'rgba(245,242,234,0.3)', marginLeft: 'auto' }}>INC-20260925-0342</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── PROBLEM ──────────────────────────────────────────────────── */}
          <section className="vg-light" aria-labelledby="problem-heading" style={{ padding: '96px 0' }}>
            <div className="vg-container">
              <div style={{ display: 'grid', gridTemplateColumns: '5fr 7fr', gap: 80, alignItems: 'start' }}>
                <div>
                  <h2
                    id="problem-heading"
                    className="vg-serif"
                    style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0B0D10' }}
                  >
                    Emergencies don't wait for menus.
                  </h2>
                </div>
                <div>
                  <p style={{ fontSize: 18, lineHeight: 1.7, color: '#3C3C3A', marginBottom: 40 }}>
                    In a crisis, people need to talk — not navigate apps and fill out forms.
                    Yet most reporting systems are designed for calm conditions, not panic.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {[
                      { label: 'Seconds lost', desc: 'Every tap through a UI is time the emergency grows worse.', color: '#E8442C' },
                      { label: 'Cognitive load', desc: 'High stress makes structured forms nearly impossible to complete accurately.', color: '#E0A526' },
                      { label: 'Fragmented data', desc: 'Incident information scattered across calls, texts, and separate apps.', color: '#3B7EA1' },
                    ].map((p, i) => (
                      <div
                        key={p.label}
                        style={{
                          display: 'grid', gridTemplateColumns: '4px 1fr',
                          gap: 20, paddingTop: i === 0 ? 0 : 28, paddingBottom: 28,
                          borderBottom: i < 2 ? '1px solid rgba(11,13,16,0.1)' : 'none',
                        }}
                      >
                        <div style={{ width: 4, background: p.color, borderRadius: 2, minHeight: 48 }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16, color: '#0B0D10', marginBottom: 6 }}>{p.label}</div>
                          <div style={{ fontSize: 15, color: '#5C5C5A', lineHeight: 1.6 }}>{p.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── SOLUTION ─────────────────────────────────────────────────── */}
          <section className="vg-dark" aria-labelledby="solution-heading" style={{ padding: '96px 0' }}>
            <div className="vg-container">
              <div style={{ maxWidth: 560, marginBottom: 64 }}>
                <div className="vg-mono" style={{ fontSize: 11, color: '#8FA396', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
                  Introducing VIGIL
                </div>
                <h2
                  id="solution-heading"
                  className="vg-serif"
                  style={{ fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#F5F2EA', marginBottom: 20 }}
                >
                  Citizens speak. AI listens. Responders act.
                </h2>
                <p style={{ fontSize: 17, lineHeight: 1.7, color: 'rgba(245,242,234,0.65)' }}>
                  VIGIL lets people report emergencies by speaking naturally. AI asks the right follow-up questions, extracts key facts, and instantly notifies the right responders — in under two seconds.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, border: '1px solid rgba(59,126,161,0.2)', borderRadius: 6, overflow: 'hidden' }}>
                {[
                  { icon: '🎙', title: 'Voice-first', desc: 'No forms, no menus. Just speak — the way you naturally describe an emergency.', accent: '#E8442C' },
                  { icon: '🧠', title: 'AI understanding', desc: 'Extracts location, severity, incident type, and key details in real time.', accent: '#E0A526' },
                  { icon: '⚡', title: 'Real-time coordination', desc: 'Structured incidents shared instantly with the right responders.', accent: '#3B7EA1' },
                  { icon: '🏘', title: 'Safer communities', desc: 'Faster response times translate directly to better outcomes.', accent: '#8FA396' },
                ].map(p => (
                  <div
                    key={p.title}
                    style={{
                      padding: '32px 28px',
                      background: '#0F1318',
                      borderTop: `3px solid ${p.accent}`,
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 16 }}>{p.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#F5F2EA', marginBottom: 10 }}>{p.title}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(245,242,234,0.5)' }}>{p.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
          <section id="how-it-works" className="vg-light" aria-labelledby="hiw-heading" style={{ padding: '96px 0' }}>
            <div className="vg-container">
              <div style={{ marginBottom: 56 }}>
                <h2
                  id="hiw-heading"
                  className="vg-serif"
                  style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0B0D10', marginBottom: 16 }}
                >
                  From call to dispatch — in under a minute.
                </h2>
                <p style={{ fontSize: 16, color: '#5C5C5A', maxWidth: 520 }}>
                  Every step is logged, auditable, and traceable back to what the caller actually said.
                </p>
              </div>

              {/* Dispatch log strip */}
              <div
                style={{
                  border: '1px solid rgba(11,13,16,0.15)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: 'grid', gridTemplateColumns: '80px 100px 1fr 100px',
                    background: '#0B0D10', color: 'rgba(245,242,234,0.5)',
                    fontSize: 10, letterSpacing: '0.1em',
                    padding: '8px 20px', gap: 16,
                  }}
                >
                  <span>STEP</span>
                  <span>TIME</span>
                  <span>EVENT</span>
                  <span>STATUS</span>
                </div>

                {[
                  {
                    step: 'STEP-01', time: '00:00', event: 'Citizen begins speaking — describes the emergency in their own words',
                    status: 'ACTIVE', statusColor: '#E8442C',
                    detail: 'Voice stream opened · ASR active',
                  },
                  {
                    step: 'STEP-02', time: '00:04', event: 'AI begins structured questioning — fills in gaps the caller hasn\'t covered',
                    status: 'AI', statusColor: '#3B7EA1',
                    detail: 'Clarification turn initiated',
                  },
                  {
                    step: 'STEP-03', time: '00:11', event: 'Conversation converted to structured incident record',
                    status: 'DONE', statusColor: '#8FA396',
                    detail: 'Type · Severity · Location extracted',
                  },
                  {
                    step: 'STEP-04', time: '00:14', event: 'Location confirmed and normalized — precise coordinates passed to dispatch',
                    status: 'DONE', statusColor: '#8FA396',
                    detail: 'Geocode resolved ±12m',
                  },
                  {
                    step: 'STEP-05', time: '00:18', event: 'Right teams notified — fire, medical, police coordinated immediately',
                    status: 'DONE', statusColor: '#8FA396',
                    detail: '3 units assigned',
                  },
                ].map((row, i) => (
                  <div
                    key={row.step}
                    style={{
                      display: 'grid', gridTemplateColumns: '80px 100px 1fr 100px',
                      gap: 16, padding: '18px 20px',
                      background: i % 2 === 0 ? '#F5F2EA' : '#EDEBE2',
                      borderTop: i === 0 ? 'none' : '1px solid rgba(11,13,16,0.07)',
                      alignItems: 'start',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#0B0D10', letterSpacing: '0.06em' }}>{row.step}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: '#3B7EA1', fontWeight: 500 }}>{row.time}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, color: '#0B0D10', fontWeight: 500, marginBottom: 4, fontFamily: 'inherit' }}>{row.event}</div>
                      <div style={{ fontSize: 11, color: '#8A8880', letterSpacing: '0.04em' }}>{row.detail}</div>
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: 10, fontWeight: 700,
                          padding: '3px 8px', borderRadius: 2,
                          background: row.statusColor + '22',
                          color: row.statusColor,
                          border: `1px solid ${row.statusColor}55`,
                          letterSpacing: '0.08em',
                        }}
                      >
                        {row.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── CITIZEN EXPERIENCE ───────────────────────────────────────── */}
          <section className="vg-dark" aria-labelledby="citizen-heading" style={{ padding: '96px 0' }}>
            <div className="vg-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
              <div>
                <h2
                  id="citizen-heading"
                  className="vg-serif"
                  style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#F5F2EA', marginBottom: 20 }}
                >
                  Simple. Fast. Built for panic.
                </h2>
                <p style={{ fontSize: 17, lineHeight: 1.7, color: 'rgba(245,242,234,0.65)', marginBottom: 40 }}>
                  No interface to learn. No forms to fill. The caller just talks — and VIGIL handles the rest.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {[
                    { title: 'Just talk', desc: 'No menus, no buttons, no typing. Speak like you would to anyone.' },
                    { title: 'We handle the rest', desc: 'AI asks only what\'s necessary — no more, no less.' },
                    { title: 'Designed for stress', desc: 'Tested for panic conditions, not calm ones. Optimized for the worst moment.' },
                  ].map(p => (
                    <div key={p.title} style={{ display: 'flex', gap: 16, alignItems: 'start' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B7EA1', flexShrink: 0, marginTop: 8 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15, color: '#F5F2EA', marginBottom: 4 }}>{p.title}</div>
                        <div style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(245,242,234,0.5)' }}>{p.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 40 }}>
                  <button
                    className="btn-primary"
                    style={{ fontSize: 16, padding: '14px 32px' }}
                    onClick={() => navigate('/emergency')}
                  >
                    Try It Now
                  </button>
                </div>
              </div>

              {/* Phone mockup */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div
                  style={{
                    width: 300,
                    background: '#12161C',
                    borderRadius: 40,
                    border: '2px solid rgba(59,126,161,0.25)',
                    boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,126,161,0.1)',
                    overflow: 'hidden',
                    padding: '16px 0',
                  }}
                >
                  {/* Phone top bar */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(59,126,161,0.1)', marginInline: 16 }}>
                    <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(245,242,234,0.1)' }} />
                  </div>

                  {/* Header */}
                  <div style={{ padding: '8px 20px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1B3D4F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                        <polygon points="14,2 26,22 2,22" fill="none" stroke="#3B7EA1" strokeWidth="2.5"/>
                        <circle cx="14" cy="17" r="2" fill="#E8442C"/>
                        <line x1="14" y1="7" x2="14" y2="14" stroke="#E8442C" strokeWidth="1.5"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#F5F2EA' }}>VIGIL Emergency</div>
                      <div style={{ fontSize: 10, color: '#8FA396', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8FA396', display: 'inline-block', animation: 'pulse-dot 1.8s infinite', flexShrink: 0 }} />
                        Connected · Listening
                      </div>
                    </div>
                  </div>

                  {/* Waveform strip */}
                  <div style={{ background: '#0B0E14', padding: '10px 20px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 24, justifyContent: 'center' }}>
                      {Array.from({ length: 24 }, (_, i) => {
                        const heights = [4,8,14,6,20,10,16,4,12,18,8,22,6,18,10,14,6,20,12,8,16,4,10,6]
                        return (
                          <div
                            key={i}
                            style={{
                              width: 3, height: heights[i],
                              borderRadius: 2,
                              background: '#3B7EA1',
                              opacity: 0.5 + (heights[i] / 22) * 0.5,
                              animation: `blink ${0.8 + (i % 5) * 0.3}s ease-in-out infinite alternate`,
                            }}
                          />
                        )
                      })}
                    </div>
                    <div className="vg-mono" style={{ fontSize: 9, color: 'rgba(245,242,234,0.3)', textAlign: 'center', marginTop: 6, letterSpacing: '0.06em' }}>RECORDING IN PROGRESS</div>
                  </div>

                  {/* Chat messages */}
                  <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
                      <div className="bubble-caller" style={{ padding: '10px 14px', fontSize: 13, lineHeight: 1.55 }}>
                        There's a fire in my apartment building — fourth floor.
                      </div>
                      <div className="vg-mono" style={{ fontSize: 9, color: 'rgba(245,242,234,0.25)', marginTop: 4, paddingLeft: 4 }}>Caller · 00:00</div>
                    </div>

                    <div style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
                      <div className="bubble-vigil" style={{ padding: '10px 14px', fontSize: 13, lineHeight: 1.55 }}>
                        Are you still inside the building right now?
                      </div>
                      <div className="vg-mono" style={{ fontSize: 9, color: 'rgba(245,242,234,0.25)', marginTop: 4, textAlign: 'right', paddingRight: 4 }}>VIGIL · 00:04</div>
                    </div>

                    <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
                      <div className="bubble-caller" style={{ padding: '10px 14px', fontSize: 13, lineHeight: 1.55 }}>
                        Yes — I'm on the fourth floor. I can smell smoke.
                      </div>
                      <div className="vg-mono" style={{ fontSize: 9, color: 'rgba(245,242,234,0.25)', marginTop: 4, paddingLeft: 4 }}>Caller · 00:07</div>
                    </div>

                    <div style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
                      <div className="bubble-vigil" style={{ padding: '10px 14px', fontSize: 13, lineHeight: 1.55 }}>
                        Understood. Fire services are being dispatched now. Stay low and don't use the elevator.
                        <span className="animate-blink" style={{ color: '#3B7EA1', marginLeft: 2 }}>▋</span>
                      </div>
                      <div className="vg-mono" style={{ fontSize: 9, color: 'rgba(245,242,234,0.25)', marginTop: 4, textAlign: 'right', paddingRight: 4 }}>VIGIL · 00:11</div>
                    </div>
                  </div>

                  {/* Incident chip */}
                  <div
                    style={{
                      margin: '16px 16px 8px',
                      background: 'rgba(232,68,44,0.08)',
                      border: '1px solid rgba(232,68,44,0.2)',
                      borderRadius: 6,
                      padding: '10px 14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#E8442C', marginBottom: 2 }}>INCIDENT CREATED</div>
                      <div className="vg-mono" style={{ fontSize: 11, color: 'rgba(245,242,234,0.5)' }}>INC-20260925-0342</div>
                    </div>
                    <span className="chip chip-red" style={{ fontSize: 10 }}>CRITICAL</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── OPERATOR DASHBOARD ───────────────────────────────────────── */}
          <section id="operator" className="vg-light" aria-labelledby="operator-heading" style={{ padding: '96px 0' }}>
            <div className="vg-container">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 72, alignItems: 'start' }}>
                <div>
                  <h2
                    id="operator-heading"
                    className="vg-serif"
                    style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0B0D10', marginBottom: 20 }}
                  >
                    Mission Control for your operators.
                  </h2>
                  <p style={{ fontSize: 17, lineHeight: 1.7, color: '#5C5C5A', marginBottom: 32 }}>
                    Real-time situational awareness — every incident, every responder, every update in one place.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
                    {[
                      ['Live incident map', 'Geolocated markers with severity color-coding.'],
                      ['Transcripts & facts', 'Full record of how every piece of information was obtained.'],
                      ['Responder coordination', 'Assign, track, and dispatch in a single view.'],
                      ['Realtime sync', 'Live updates via WebSocket — no manual refresh required.'],
                    ].map(([title, desc]) => (
                      <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#3B7EA1', flexShrink: 0, marginTop: 9 }} />
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 14, color: '#0B0D10' }}>{title}</span>
                          <span style={{ fontSize: 14, color: '#6C6C6A' }}>{` — ${desc}`}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn-outline"
                    style={{ fontSize: 15, borderColor: '#0B0D10', color: '#0B0D10' }}
                    onClick={() => navigate('/operator')}
                    onMouseOver={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#0B0D10'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#F5F2EA'
                    }}
                    onMouseOut={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#0B0D10'
                    }}
                  >
                    Open Dashboard
                  </button>
                </div>

                {/* Console mockup */}
                <div
                  style={{
                    background: '#0B0D10',
                    borderRadius: 8,
                    border: '1px solid rgba(59,126,161,0.2)',
                    overflow: 'hidden',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
                  }}
                >
                  {/* Topbar */}
                  <div
                    style={{
                      background: '#0F1318',
                      padding: '10px 16px',
                      borderBottom: '1px solid rgba(59,126,161,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PulseDot color="#E8442C" />
                      <span className="vg-mono" style={{ fontSize: 11, color: '#3B7EA1', letterSpacing: '0.08em' }}>VIGIL MISSION CONTROL</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[
                        { label: '24', sublabel: 'ACTIVE', color: '#E0A526' },
                        { label: '3', sublabel: 'CRITICAL', color: '#E8442C' },
                        { label: '12', sublabel: 'UNITS', color: '#3B7EA1' },
                        { label: '72s', sublabel: 'AVG RESP', color: '#8FA396' },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center', minWidth: 40 }}>
                          <div className="vg-mono" style={{ fontSize: 16, fontWeight: 500, color: s.color }}>{s.label}</div>
                          <div className="vg-mono" style={{ fontSize: 9, color: 'rgba(245,242,234,0.3)', letterSpacing: '0.06em' }}>{s.sublabel}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Column headers */}
                  <div
                    style={{
                      display: 'grid', gridTemplateColumns: '140px 1fr 90px 70px',
                      gap: 12, padding: '8px 16px',
                      borderBottom: '1px solid rgba(59,126,161,0.1)',
                    }}
                  >
                    {['INCIDENT ID', 'SUMMARY', 'TYPE', 'STATUS'].map(h => (
                      <div key={h} className="vg-mono" style={{ fontSize: 9, color: 'rgba(245,242,234,0.25)', letterSpacing: '0.1em' }}>{h}</div>
                    ))}
                  </div>

                  {/* Incident rows */}
                  {[
                    {
                      id: 'INC-20260925-0342', summary: '4th floor apt fire — 4 trapped, 2 injuries',
                      type: 'FIRE', typeColor: '#E8442C', status: 'CRITICAL', statusColor: '#E8442C',
                    },
                    {
                      id: 'INC-20260925-0341', summary: 'RTA — 2 vehicles, 1 injury reported',
                      type: 'MEDICAL', typeColor: '#E0A526', status: 'ACTIVE', statusColor: '#E0A526',
                    },
                    {
                      id: 'INC-20260925-0340', summary: 'Suspicious activity near mall entrance',
                      type: 'POLICE', typeColor: '#3B7EA1', status: 'ACTIVE', statusColor: '#3B7EA1',
                    },
                    {
                      id: 'INC-20260925-0339', summary: 'Gas leak at residential property',
                      type: 'FIRE', typeColor: '#E8442C', status: 'EN ROUTE', statusColor: '#E0A526',
                    },
                    {
                      id: 'INC-20260925-0338', summary: 'Chest pain — elderly male, 72',
                      type: 'MEDICAL', typeColor: '#E0A526', status: 'ON SITE', statusColor: '#8FA396',
                    },
                    {
                      id: 'INC-20260925-0337', summary: 'Noise complaint — potential domestic',
                      type: 'POLICE', typeColor: '#3B7EA1', status: 'RESOLVED', statusColor: '#8FA396',
                    },
                  ].map((row, i) => (
                    <div
                      key={row.id}
                      style={{
                        display: 'grid', gridTemplateColumns: '140px 1fr 90px 70px',
                        gap: 12, padding: '11px 16px',
                        background: i === 0 ? 'rgba(232,68,44,0.05)' : 'transparent',
                        borderBottom: '1px solid rgba(59,126,161,0.07)',
                        alignItems: 'center',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onClick={() => navigate('/operator/incidents')}
                      onMouseOver={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(59,126,161,0.07)'}
                      onMouseOut={e => (e.currentTarget as HTMLDivElement).style.background = i === 0 ? 'rgba(232,68,44,0.05)' : 'transparent'}
                    >
                      <div className="vg-mono" style={{ fontSize: 11, color: '#3B7EA1', letterSpacing: '0.03em' }}>{row.id}</div>
                      <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.7)', fontWeight: 500, lineHeight: 1.4 }}>{row.summary}</div>
                      <div>
                        <span
                          className="chip"
                          style={{
                            background: row.typeColor + '22',
                            color: row.typeColor,
                            border: `1px solid ${row.typeColor}44`,
                            fontSize: 10,
                          }}
                        >
                          {row.type}
                        </span>
                      </div>
                      <div>
                        <span
                          className="chip"
                          style={{
                            background: row.statusColor + '22',
                            color: row.statusColor,
                            border: `1px solid ${row.statusColor}44`,
                            fontSize: 10,
                          }}
                        >
                          {row.status}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Footer */}
                  <div
                    style={{
                      padding: '10px 16px',
                      borderTop: '1px solid rgba(59,126,161,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span className="vg-mono" style={{ fontSize: 10, color: 'rgba(245,242,234,0.25)' }}>
                      Showing 6 of 24 incidents
                    </span>
                    <button
                      style={{
                        background: 'none', border: '1px solid rgba(59,126,161,0.3)',
                        borderRadius: 2, padding: '4px 10px',
                        fontSize: 10, color: '#3B7EA1', cursor: 'pointer',
                        fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600,
                      }}
                      onClick={() => navigate('/operator/incidents')}
                    >
                      View All
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── INCIDENT DETAIL ───────────────────────────────────────────── */}
          <section className="vg-dark" aria-labelledby="incident-heading" style={{ padding: '96px 0' }}>
            <div className="vg-container">
              <div style={{ maxWidth: 560, marginBottom: 56 }}>
                <h2
                  id="incident-heading"
                  className="vg-serif"
                  style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#F5F2EA', marginBottom: 16 }}
                >
                  Every call, a trackable record.
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.7, color: 'rgba(245,242,234,0.55)' }}>
                  Conversations become structured incidents — fully auditable from first word to final action.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 40 }}>
                {/* Facts */}
                <div
                  style={{
                    border: '1px solid rgba(59,126,161,0.2)',
                    borderRadius: 6, overflow: 'hidden',
                    background: '#0F1318',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 20px',
                      borderBottom: '1px solid rgba(59,126,161,0.15)',
                      background: '#14191F',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span className="vg-mono" style={{ fontSize: 11, color: '#3B7EA1', letterSpacing: '0.06em' }}>INCIDENT FACTS</span>
                    <span className="chip chip-red">CRITICAL</span>
                  </div>
                  <div style={{ padding: '20px' }}>
                    <div className="vg-mono" style={{ fontSize: 11, color: '#E8442C', marginBottom: 14, letterSpacing: '0.06em' }}>INC-20260925-0342</div>
                    {[
                      ['Type', 'Structure Fire'],
                      ['Address', '47 Elmwood Drive, Block B'],
                      ['Trapped', '4 persons'],
                      ['Injuries', '2 reported'],
                      ['Fire', 'Confirmed, floor 4'],
                      ['Evacuation', 'Partial — stairwell B clear'],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        style={{
                          display: 'grid', gridTemplateColumns: '90px 1fr',
                          gap: 12, padding: '8px 0',
                          borderBottom: '1px solid rgba(59,126,161,0.08)',
                        }}
                      >
                        <div className="vg-mono" style={{ fontSize: 11, color: 'rgba(245,242,234,0.35)', letterSpacing: '0.04em' }}>{k}</div>
                        <div style={{ fontSize: 13, color: 'rgba(245,242,234,0.8)', fontWeight: 500 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timeline + responders */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Timeline */}
                  <div style={{ border: '1px solid rgba(59,126,161,0.2)', borderRadius: 6, background: '#0F1318', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(59,126,161,0.15)', background: '#14191F' }}>
                      <span className="vg-mono" style={{ fontSize: 11, color: '#3B7EA1', letterSpacing: '0.06em' }}>TIMELINE</span>
                    </div>
                    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {[
                        { ts: '17:14:00', event: 'Incident created', color: '#E8442C' },
                        { ts: '17:14:04', event: 'Type classified — Structure Fire', color: '#E0A526' },
                        { ts: '17:14:09', event: 'Severity confirmed Critical', color: '#E8442C' },
                        { ts: '17:14:14', event: 'Location verified via geocode', color: '#3B7EA1' },
                        { ts: '17:14:18', event: 'Engine 4, Medic 2, Unit 7 assigned', color: '#8FA396' },
                      ].map((e, i, arr) => (
                        <div key={e.ts} style={{ display: 'flex', gap: 16, alignItems: 'start', paddingBottom: i < arr.length - 1 ? 16 : 0, position: 'relative' }}>
                          {i < arr.length - 1 && (
                            <div style={{ position: 'absolute', left: 42, top: 24, width: 1, height: 'calc(100% - 8px)', background: 'rgba(59,126,161,0.15)' }} />
                          )}
                          <div className="vg-mono" style={{ fontSize: 11, color: 'rgba(245,242,234,0.3)', minWidth: 60, letterSpacing: '0.04em', flexShrink: 0, paddingTop: 2 }}>
                            {e.ts}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.color, flexShrink: 0 }} />
                            <div style={{ fontSize: 13, color: 'rgba(245,242,234,0.7)', lineHeight: 1.4 }}>{e.event}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Responders */}
                  <div style={{ border: '1px solid rgba(59,126,161,0.2)', borderRadius: 6, background: '#0F1318', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(59,126,161,0.15)', background: '#14191F' }}>
                      <span className="vg-mono" style={{ fontSize: 11, color: '#3B7EA1', letterSpacing: '0.06em' }}>ASSIGNED RESPONDERS</span>
                    </div>
                    <div style={{ padding: '0' }}>
                      {[
                        { id: 'Engine 4', type: 'Fire', status: 'EN ROUTE', statusColor: '#E0A526' },
                        { id: 'Medic 2', type: 'Medical', status: 'ON SITE', statusColor: '#8FA396' },
                        { id: 'Unit 7', type: 'Police', status: 'EN ROUTE', statusColor: '#E0A526' },
                        { id: 'Engine 8', type: 'Fire', status: 'AVAILABLE', statusColor: '#8FA396' },
                      ].map((r, i) => (
                        <div
                          key={r.id}
                          style={{
                            display: 'grid', gridTemplateColumns: '90px 1fr 90px',
                            gap: 12, padding: '11px 20px',
                            borderBottom: '1px solid rgba(59,126,161,0.07)',
                            alignItems: 'center',
                          }}
                        >
                          <div className="vg-mono" style={{ fontSize: 12, color: '#F5F2EA', fontWeight: 500 }}>{r.id}</div>
                          <div style={{ fontSize: 12, color: 'rgba(245,242,234,0.4)' }}>{r.type}</div>
                          <div>
                            <span
                              className="chip"
                              style={{
                                background: r.statusColor + '22',
                                color: r.statusColor,
                                border: `1px solid ${r.statusColor}44`,
                                fontSize: 9,
                              }}
                            >
                              {r.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── TRUST & SAFETY ───────────────────────────────────────────── */}
          <section className="vg-light" aria-labelledby="trust-heading" style={{ padding: '96px 0' }}>
            <div className="vg-container">
              <div style={{ display: 'grid', gridTemplateColumns: '5fr 7fr', gap: 80, alignItems: 'start' }}>
                <div>
                  <h2
                    id="trust-heading"
                    className="vg-serif"
                    style={{ fontSize: 'clamp(32px, 4vw, 50px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0B0D10' }}
                  >
                    AI assists.
                    <br />
                    <span style={{ color: '#3B7EA1' }}>It doesn't decide.</span>
                  </h2>
                </div>
                <div>
                  <p style={{ fontSize: 17, lineHeight: 1.7, color: '#4C4C4A', marginBottom: 36 }}>
                    AI helps understand conversations and extract information — but it is never the final authority on an emergency. Operator judgment, backend validation, and deterministic rules remain the source of truth.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                    {[
                      { title: 'Backend validation', desc: 'Every AI-extracted field is checked before being treated as fact.', icon: '✓' },
                      { title: 'Deterministic rules', desc: 'Severity and classification follow fixed domain logic — not AI guesses.', icon: '⧖' },
                      { title: 'Operator authority', desc: 'Humans confirm, override, and act. AI only assists — never commands.', icon: '⊕' },
                      { title: 'Auditable records', desc: 'Every decision traces back to the original transcript and timestamp.', icon: '≡' },
                    ].map(p => (
                      <div
                        key={p.title}
                        style={{
                          padding: '20px 22px',
                          border: '1px solid rgba(11,13,16,0.1)',
                          borderRadius: 4,
                          background: '#F0EDE4',
                        }}
                      >
                        <div className="vg-mono" style={{ fontSize: 18, color: '#3B7EA1', marginBottom: 12 }}>{p.icon}</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0B0D10', marginBottom: 6 }}>{p.title}</div>
                        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#6C6C6A' }}>{p.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── UNDER THE HOOD ───────────────────────────────────────────── */}
          <section className="vg-dark" aria-labelledby="tech-heading" style={{ padding: '96px 0' }}>
            <div className="vg-container">
              <div style={{ textAlign: 'center', marginBottom: 64, maxWidth: 560, margin: '0 auto 64px' }}>
                <h2
                  id="tech-heading"
                  className="vg-serif"
                  style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#F5F2EA', marginBottom: 16 }}
                >
                  Robust. Scalable. Secure.
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.7, color: 'rgba(245,242,234,0.5)' }}>
                  A purpose-built architecture for mission-critical conditions.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, border: '1px solid rgba(59,126,161,0.15)', borderRadius: 6, overflow: 'hidden' }}>
                {[
                  { label: 'Conversational AI', detail: 'Context-aware LLM drives dynamic questioning — adapts to the caller\'s words, not a rigid script.', accent: '#3B7EA1' },
                  { label: 'Real-time Voice', detail: 'AssemblyAI speech-to-text with turn detection and interruption handling — designed for noisy, high-stress calls.', accent: '#E0A526' },
                  { label: 'Secure Backend', detail: 'Deterministic classification rules, input validation, and audited data storage — no AI outputs pass through unchecked.', accent: '#8FA396' },
                  { label: 'Geolocation', detail: 'Nominatim geocoding confirms and normalizes reported locations — address ambiguity resolved before dispatch.', accent: '#3B7EA1' },
                  { label: 'Realtime Events', detail: 'WebSocket-based live sync keeps every operator console updated the instant anything changes.', accent: '#E0A526' },
                  { label: 'Auditable Design', detail: 'Every action, classification, and assignment traces back to the timestamp and transcript line that triggered it.', accent: '#8FA396' },
                ].map(t => (
                  <div
                    key={t.label}
                    style={{
                      padding: '32px 28px',
                      background: '#0F1318',
                      borderLeft: `3px solid ${t.accent}`,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#F5F2EA', marginBottom: 10 }}>{t.label}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.65, color: 'rgba(245,242,234,0.45)' }}>{t.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── CLOSING CTA ───────────────────────────────────────────────── */}
          <section
            className="vg-dark"
            aria-labelledby="cta-heading"
            style={{
              padding: '100px 0 80px',
              borderTop: '1px solid rgba(59,126,161,0.15)',
              position: 'relative', overflow: 'hidden',
            }}
          >
            {/* Waveform echo */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, opacity: 0.15 }}>
              <WaveformCanvas />
            </div>

            <div className="vg-container" style={{ position: 'relative', textAlign: 'center' }}>
              <h2
                id="cta-heading"
                className="vg-serif"
                style={{ fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 900, lineHeight: 1.0, letterSpacing: '-0.02em', color: '#F5F2EA', marginBottom: 20 }}
              >
                A safer tomorrow,
                <br />
                powered by your voice.
              </h2>
              <p style={{ fontSize: 18, lineHeight: 1.7, color: 'rgba(245,242,234,0.55)', maxWidth: 480, margin: '0 auto 48px' }}>
                Faster response times. More lives saved. From distress calls to real action — let's build safer communities together.
              </p>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn-primary"
                  style={{ fontSize: 16, padding: '16px 40px' }}
                  onClick={() => navigate('/emergency')}
                >
                  Report Emergency
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 16, padding: '16px 40px' }}
                  onClick={() => navigate('/operator')}
                >
                  Operator Dashboard
                </button>
              </div>
            </div>
          </section>

        </main>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <footer
          className="vg-dark"
          style={{
            borderTop: '1px solid rgba(59,126,161,0.12)',
            padding: '32px 0',
          }}
        >
          <div
            className="vg-container"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <polygon points="14,2 26,22 2,22" fill="none" stroke="#3B7EA1" strokeWidth="2"/>
                <circle cx="14" cy="17" r="2" fill="#E8442C"/>
                <line x1="14" y1="7" x2="14" y2="14" stroke="#E8442C" strokeWidth="1.5"/>
              </svg>
              <span className="vg-serif" style={{ fontSize: 16, fontWeight: 700, color: 'rgba(245,242,234,0.7)' }}>VIGIL</span>
              <span style={{ fontSize: 13, color: 'rgba(245,242,234,0.3)' }}>— Emergency Response Platform</span>
            </div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <span className="vg-mono" style={{ fontSize: 11, color: 'rgba(245,242,234,0.25)', letterSpacing: '0.06em' }}>
                © 2026 VIGIL. Hear. Understand. Respond.
              </span>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
