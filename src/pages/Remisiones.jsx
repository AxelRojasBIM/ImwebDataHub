import { useEffect, useState, useMemo } from 'react'
import { API } from '../App'

export default function Remisiones() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`${API}/api/remisiones`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => { setRows(Array.isArray(d) ? d : d.data ?? []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const filtered = useMemo(() => rows.filter(r => {
    const q = search.toLowerCase()
    return !q || JSON.stringify(r).toLowerCase().includes(q)
  }), [rows, search])

  const cols = rows.length > 0 ? Object.keys(rows[0]).slice(0, 12) : []

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Remisiones CEQ</div>
          <div className="topbar-sub">{rows.length.toLocaleString()} registros · tabla RemisionesDetalleCEQ</div>
        </div>
        <div className="topbar-actions">
          <span className="badge green">CEQ ext.</span>
        </div>
      </div>
      <div className="content">
        {error && <div className="error-msg">Error al cargar: {error}</div>}
        <div className="filter-bar">
          <input placeholder="Buscar en remisiones..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="btn" onClick={() => setSearch('')}>Limpiar</button>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>{filtered.length.toLocaleString()} resultados</span>
        </div>
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="empty">Sin datos. La extensión CEQ aún no ha guardado remisiones.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {filtered.slice(0, 500).map((r, i) => (
                  <tr key={i}>{cols.map(c => <td key={c}>{String(r[c] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 500 && <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>Mostrando 500 de {filtered.length.toLocaleString()}.</div>}
          </div>
        )}
      </div>
    </>
  )
}
