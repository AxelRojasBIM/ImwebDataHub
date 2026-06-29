import { useEffect, useState, useMemo } from 'react'
import { API } from '../App'

export default function CatalogoCupos() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [ceve, setCeve] = useState('')

  useEffect(() => {
    fetch(`${API}/api/cupos`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => { setRows(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const ceveList = useMemo(() => [...new Set(rows.map(r => r.ceve))].sort(), [rows])

  const filtered = useMemo(() => rows.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q || r.ceve?.toLowerCase().includes(q) || r.item?.toLowerCase().includes(q) || r.producto?.toLowerCase().includes(q)
    const matchCeve = !ceve || r.ceve === ceve
    return matchSearch && matchCeve
  }), [rows, search, ceve])

  const cols = ['Ceve', 'Item', 'Producto', 'Cupo', 'Torre', 'CupoTorre', 'Transpo', 'DiasMin', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'ActualizadoEn']

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Catálogo de cupos</div>
          <div className="topbar-sub">{rows.length.toLocaleString()} registros · tabla CatalogoCuposImweb</div>
        </div>
        <div className="topbar-actions">
          <span className="badge blue">Imweb ext.</span>
        </div>
      </div>
      <div className="content">
        {error && <div className="error-msg">Error al cargar: {error}</div>}
        <div className="filter-bar">
          <input placeholder="Buscar CEVE, item o producto..." value={search} onChange={e => setSearch(e.target.value)} />
          <select value={ceve} onChange={e => setCeve(e.target.value)}>
            <option value="">Todos los CEVEs</option>
            {ceveList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(search || ceve) && <button className="btn" onClick={() => { setSearch(''); setCeve('') }}>Limpiar</button>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>{filtered.length.toLocaleString()} resultados</span>
        </div>
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{cols.map(c => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={cols.length} className="empty">Sin resultados</td></tr>
                ) : filtered.slice(0, 500).map((r, i) => (
                  <tr key={i}>
                    <td>{r.ceve}</td><td>{r.item}</td><td>{r.producto}</td>
                    <td>{r.cupo}</td><td>{r.torre}</td><td>{r.cupoTorre}</td>
                    <td>{r.transpo}</td><td>{r.diasMin}</td>
                    <td>{r.lun}</td><td>{r.mar}</td><td>{r.mie}</td>
                    <td>{r.jue}</td><td>{r.vie}</td><td>{r.sab}</td>
                    <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{r.actualizadoEn ? new Date(r.actualizadoEn).toLocaleDateString('es-MX') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 500 && <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>Mostrando 500 de {filtered.length.toLocaleString()}. Usa el filtro para acotar.</div>}
          </div>
        )}
      </div>
    </>
  )
}
