import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../AuthContext'

// Chispas de colores que salen disparadas del cursor al moverlo (gravedad +
// desvanecido + glow). Mismo mecanismo que usa el login de Vortex, con
// nuestra propia paleta de azules para "Cauce".
const CAUCE_PALETTE = ['#0b3f96', '#1a56db', '#4f8cff', '#ffffff', '#7eb8ff', '#b3d4ff']

function CauceBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf, timeoutId
    let particles = []
    const mouse = { x: 0, y: 0 }
    let moving = false

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    function onMove(e) {
      mouse.x = e.clientX; mouse.y = e.clientY
      moving = true
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => { moving = false }, 80)
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove)

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (moving) {
        for (let i = 0; i < 4; i++) {
          const angle = Math.random() * Math.PI * 2
          const speed = 2 * Math.random() + 0.5
          particles.push({
            x: mouse.x + (Math.random() - 0.5) * 8,
            y: mouse.y + (Math.random() - 0.5) * 8,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.2,
            r: 2.5 * Math.random() + 1,
            alpha: 1,
            decay: 0.018 * Math.random() + 0.012,
            color: CAUCE_PALETTE[Math.floor(Math.random() * CAUCE_PALETTE.length)],
          })
        }
      }
      particles = particles.filter(p => p.alpha > 0 && p.r > 0.2)
      for (const p of particles) {
        p.vy += 0.04
        p.x += p.vx
        p.y += p.vy
        p.r *= 0.98
        p.alpha -= p.decay
        ctx.save()
        ctx.globalAlpha = Math.max(0, p.alpha)
        ctx.shadowBlur = 8
        ctx.shadowColor = p.color
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      raf = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timeoutId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  return (
    <canvas ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  )
}

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    setError('')
    const result = await login(username, password)
    setLoading(false)
    if (!result.ok) setError(result.error)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'fixed', inset: 0, opacity: 0.03, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(79,140,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(79,140,255,1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />
      <CauceBackground />
      <form onSubmit={handleSubmit} style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '32px 30px', width: 320, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
          <span style={{ color: '#4f8cff' }}>Ca</span>uce
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 22 }}>Inicia sesión para continuar</div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Usuario</label>
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoFocus
          style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
        />

        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 18, boxSizing: 'border-box' }}
        />

        {error && <div className="error-msg">{error}</div>}

        <button type="submit" className="btn primary" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
