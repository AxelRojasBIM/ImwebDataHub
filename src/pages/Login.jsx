import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../AuthContext'

// Fondo de puntos que solo se "revelan" cerca del cursor -- mismo efecto que
// vimos en Vortex. Canvas casero en vez de una librería de partículas para no
// sumar peso al bundle por un detalle puramente decorativo del login.
function ParticleBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf, w, h
    const mouse = { x: -9999, y: -9999 }

    function resize() {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    resize()

    const DOT_COUNT = 90
    const dots = Array.from({ length: DOT_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
    }))

    const REVEAL_RADIUS = 180
    function tick() {
      ctx.clearRect(0, 0, w, h)
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy
        if (d.x < 0) d.x = w; else if (d.x > w) d.x = 0
        if (d.y < 0) d.y = h; else if (d.y > h) d.y = 0

        const dist = Math.hypot(d.x - mouse.x, d.y - mouse.y)
        const near = Math.max(0, 1 - dist / REVEAL_RADIUS)
        const alpha = 0.04 + near * 0.55
        const radius = d.r + near * 2.2

        ctx.beginPath()
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(79, 140, 255, ${alpha})`
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    tick()

    function onMove(e) { mouse.x = e.clientX; mouse.y = e.clientY }
    function onLeave() { mouse.x = -9999; mouse.y = -9999 }
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
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
      <ParticleBackground />
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
