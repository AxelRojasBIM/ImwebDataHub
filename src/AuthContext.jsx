import { createContext, useContext, useEffect, useState } from 'react'
import { fetchWithRetry } from './apiUtils'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'
const STORAGE_KEY = 'imwebdatahub_auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null)
  const [usuario, setUsuario] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) { setAuthLoading(false); return }
    let saved
    try { saved = JSON.parse(raw) } catch { localStorage.removeItem(STORAGE_KEY); setAuthLoading(false); return }

    fetchWithRetry(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${saved.token}` } })
      .then(async res => {
        if (!res.ok) { localStorage.removeItem(STORAGE_KEY); return }
        const data = await res.json()
        setToken(data.token)
        setUsuario(data.usuario)
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setAuthLoading(false))
  }, [])

  async function login(username, password) {
    try {
      const res = await fetchWithRetry(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error || 'No se pudo iniciar sesión.' }
      setToken(data.token)
      setUsuario(data.usuario)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: data.token, usuario: data.usuario }))
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor.' }
    }
  }

  function logout() {
    if (token) fetch(`${API}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    setToken(null)
    setUsuario(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <AuthContext.Provider value={{ token, usuario, authLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
