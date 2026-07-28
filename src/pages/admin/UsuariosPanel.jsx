import { useState, useEffect, useCallback } from 'react'
import { fetchWithRetry } from '../../apiUtils'
import { useAuth } from '../../AuthContext'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'

const emptyForm = { username: '', nombreCompleto: '', password: '', roleId: '', activo: true }

export default function UsuariosPanel() {
  const { token, usuario: yo } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null = cerrado, 'new' = alta, {id,...} = edición
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPassword, setResetPassword] = useState('')

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [uRes, rRes] = await Promise.all([
        fetchWithRetry(`${API}/api/usuarios`, { headers: authHeaders }),
        fetchWithRetry(`${API}/api/roles`, { headers: authHeaders }),
      ])
      if (!uRes.ok || !rRes.ok) throw new Error('No se pudo cargar la información.')
      setUsuarios(await uRes.json())
      setRoles(await rRes.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  function openNew() {
    setForm({ ...emptyForm, roleId: roles[0]?.id ?? '' })
    setEditing('new')
  }

  function openEdit(u) {
    setForm({ username: u.username, nombreCompleto: u.nombreCompleto, password: '', roleId: u.rol.id, activo: u.activo })
    setEditing(u)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      let res
      if (editing === 'new') {
        res = await fetchWithRetry(`${API}/api/usuarios`, {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify({ username: form.username, nombreCompleto: form.nombreCompleto, password: form.password, roleId: Number(form.roleId) }),
        })
      } else {
        res = await fetchWithRetry(`${API}/api/usuarios/${editing.id}`, {
          method: 'PUT', headers: authHeaders,
          body: JSON.stringify({ nombreCompleto: form.nombreCompleto, roleId: Number(form.roleId), activo: form.activo }),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.')
      setEditing(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(u) {
    if (!confirm(`¿Eliminar al usuario "${u.username}"?`)) return
    setError('')
    try {
      const res = await fetchWithRetry(`${API}/api/usuarios/${u.id}`, { method: 'DELETE', headers: authHeaders })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar.')
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    if (!resetPassword) return
    setSaving(true)
    setError('')
    try {
      const res = await fetchWithRetry(`${API}/api/usuarios/${resetTarget.id}/password`, {
        method: 'PUT', headers: authHeaders,
        body: JSON.stringify({ newPassword: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo restablecer la contraseña.')
      setResetTarget(null)
      setResetPassword('')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}

      {!editing && (
        <div style={{ marginBottom: 14 }}>
          <button className="btn primary" onClick={openNew}>+ Nuevo usuario</button>
        </div>
      )}

      {editing && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16, maxWidth: 420 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{editing === 'new' ? 'Nuevo usuario' : `Editar: ${editing.username}`}</div>

          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Username</label>
          <input value={form.username} disabled={editing !== 'new'} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />

          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Nombre completo</label>
          <input value={form.nombreCompleto} onChange={e => setForm(f => ({ ...f, nombreCompleto: e.target.value }))}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />

          {editing === 'new' && (
            <>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Contraseña</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
            </>
          )}

          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Rol</label>
          <select value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 10 }}>
            {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>

          {editing !== 'new' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 14 }}>
              <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
              Activo
            </label>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {resetTarget && (
        <form onSubmit={handleResetPassword} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16, maxWidth: 420 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Restablecer contraseña: {resetTarget.username}</div>
          <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Nueva contraseña" autoFocus
            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Guardando…' : 'Restablecer'}</button>
            <button type="button" className="btn" onClick={() => { setResetTarget(null); setResetPassword('') }}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Username</th><th>Nombre completo</th><th>Rol</th><th>Estado</th><th>Último login</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="loading">Cargando…</td></tr>
            ) : usuarios.length === 0 ? (
              <tr><td colSpan={6} className="empty">Sin usuarios.</td></tr>
            ) : usuarios.map(u => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.nombreCompleto}</td>
                <td>{u.rol.nombre}</td>
                <td><span className={'badge ' + (u.activo ? 'green' : 'blue')}>{u.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>{u.ultimoLoginEn ? new Date(u.ultimoLoginEn).toLocaleString() : '—'}</td>
                <td style={{ display: 'flex', gap: 10 }}>
                  <a onClick={() => openEdit(u)} style={{ cursor: 'pointer', color: 'var(--accent)' }}>Editar</a>
                  <a onClick={() => setResetTarget(u)} style={{ cursor: 'pointer', color: 'var(--accent)' }}>Restablecer contraseña</a>
                  {u.id !== yo.id && <a onClick={() => handleDelete(u)} style={{ cursor: 'pointer', color: '#dc2626' }}>Eliminar</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
