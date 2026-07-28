import { useState, useEffect, useCallback } from 'react'
import { fetchWithRetry } from '../../apiUtils'
import { useAuth } from '../../AuthContext'
import nav from '../../navConfig'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'

const emptyForm = { nombre: '', accesoTotal: false, permisosMenu: [] }

export default function RolesPanel() {
  const { token } = useAuth()
  const [roles, setRoles] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | rol
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [rRes, uRes] = await Promise.all([
        fetchWithRetry(`${API}/api/roles`, { headers: authHeaders }),
        fetchWithRetry(`${API}/api/usuarios`, { headers: authHeaders }),
      ])
      if (!rRes.ok || !uRes.ok) throw new Error('No se pudo cargar la información.')
      setRoles(await rRes.json())
      setUsuarios(await uRes.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  function usuariosConRol(rolId) {
    return usuarios.filter(u => u.rol.id === rolId).length
  }

  function openNew() {
    setForm(emptyForm)
    setEditing('new')
  }

  function openEdit(r) {
    setForm({ nombre: r.nombre, accesoTotal: r.accesoTotal, permisosMenu: r.permisosMenu })
    setEditing(r)
  }

  function toggleItem(path) {
    setForm(f => ({
      ...f,
      permisosMenu: f.permisosMenu.includes(path) ? f.permisosMenu.filter(p => p !== path) : [...f.permisosMenu, path],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = JSON.stringify({ nombre: form.nombre, accesoTotal: form.accesoTotal, permisosMenu: form.permisosMenu })
      const res = editing === 'new'
        ? await fetchWithRetry(`${API}/api/roles`, { method: 'POST', headers: authHeaders, body })
        : await fetchWithRetry(`${API}/api/roles/${editing.id}`, { method: 'PUT', headers: authHeaders, body })
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

  async function handleDelete(r) {
    if (!confirm(`¿Eliminar el rol "${r.nombre}"?`)) return
    setError('')
    try {
      const res = await fetchWithRetry(`${API}/api/roles/${r.id}`, { method: 'DELETE', headers: authHeaders })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar.')
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}

      {!editing && (
        <div style={{ marginBottom: 14 }}>
          <button className="btn primary" onClick={openNew}>+ Nuevo rol</button>
        </div>
      )}

      {editing && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16, maxWidth: 460 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{editing === 'new' ? 'Nuevo rol' : `Editar: ${editing.nombre}`}</div>

          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Nombre</label>
          <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 12 }}>
            <input type="checkbox" checked={form.accesoTotal} onChange={e => setForm(f => ({ ...f, accesoTotal: e.target.checked }))} />
            Acceso total (ve todas las páginas, incluidas las nuevas)
          </label>

          {!form.accesoTotal && (
            <div style={{ marginBottom: 14, maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10 }}>
              {nav.map(group => (
                <div key={group.section} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>{group.section}</div>
                  {group.items.map(item => (
                    <label key={item.to} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '2px 0' }}>
                      <input type="checkbox" checked={form.permisosMenu.includes(item.to)} onChange={() => toggleItem(item.to)} />
                      {item.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Nombre</th><th>Acceso</th><th>Usuarios</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="loading">Cargando…</td></tr>
            ) : roles.length === 0 ? (
              <tr><td colSpan={4} className="empty">Sin roles.</td></tr>
            ) : roles.map(r => (
              <tr key={r.id}>
                <td>{r.nombre}</td>
                <td>{r.accesoTotal ? <span className="badge green">Total</span> : `${r.permisosMenu.length} página(s)`}</td>
                <td>{usuariosConRol(r.id)}</td>
                <td style={{ display: 'flex', gap: 10 }}>
                  <a onClick={() => openEdit(r)} style={{ cursor: 'pointer', color: 'var(--accent)' }}>Editar</a>
                  <a onClick={() => handleDelete(r)} style={{ cursor: 'pointer', color: '#dc2626' }}>Eliminar</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
