import { useState } from 'react'
import { useAuth } from '../AuthContext'

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
      background: 'var(--bg)',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '32px 30px', width: 320, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
          <span style={{ color: '#4f8cff' }}>CeVe</span>Data
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
