import { useState, useEffect, useCallback, useRef } from 'react'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'
const PAGE_SIZE = 100

function fmtDT(val) {
  if (!val) return '—'
  const s = String(val).slice(0, 19).replace('T', ' ')
  return s
}

function dayDot(val) {
  const v = val === true || val === 'true' || val === 1
  return (
    <span style={{
      display: 'inline-block', width: 18, height: 18, borderRadius: '50%', lineHeight: '18px',
      textAlign: 'center', fontSize: 10, fontWeight: 700,
      background: v ? '#1a56db' : '#e5e7eb',
      color: v ? '#fff' : '#9ca3af'
    }}>
      {v ? '✓' : ''}
    </span>
  )
}

// ── Imweb tab ────────────────────────────────────────────────────────────────
function TabImweb() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [inputVal, setInputVal] = useState('')
  const timer = useRef(null)

  const load = useCallback(async (p, s) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ page: p, pageSize: PAGE_SIZE, ...(s ? { search: s } : {}) })
      const r = await fetch(`${API}/api/frecuencias/imweb?${params}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData(await r.json())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page, search) }, [page, search, load])

  const handleSearch = (val) => {
    setInputVal(val)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setPage(1); setSearch(val) }, 400)
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  // alerta de última actualización
  const lastUpdated = data?.lastUpdated
  const lastDate    = lastUpdated ? new Date(lastUpdated) : null
  const hoursAgo    = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 3_600_000) : null
  const alertColor  = hoursAgo == null ? null : hoursAgo > 72 ? '#fef2f2' : hoursAgo > 24 ? '#fffbeb' : '#ecfdf5'
  const alertBorder = hoursAgo == null ? null : hoursAgo > 72 ? '#fca5a5' : hoursAgo > 24 ? '#fcd34d' : '#6ee7b7'
  const alertText   = hoursAgo == null ? null : hoursAgo > 72 ? '#991b1b' : hoursAgo > 24 ? '#92400e' : '#065f46'

  return (
    <div>
      {lastDate && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 8, fontSize: 13,
          background: alertColor, border: `1px solid ${alertBorder}`, color: alertText, marginBottom: 14 }}>
          <span style={{ fontWeight: 700 }}>⏱ Última sincronización Imweb:</span>
          <span>{fmtDT(lastUpdated)}</span>
          {hoursAgo != null && <span style={{ opacity: 0.75 }}>({hoursAgo < 1 ? 'hace menos de 1h' : `hace ${hoursAgo}h`})</span>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <input
          value={inputVal}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Buscar CeVe, Item o Producto..."
          style={{ flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
        />
        {data && <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{data.total.toLocaleString()} registros</span>}
      </div>

      <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>CeVe</th>
              <th>Item</th>
              <th>Producto</th>
              <th style={{ textAlign: 'right' }}>Cupo</th>
              <th style={{ textAlign: 'center' }}>Lun</th>
              <th style={{ textAlign: 'center' }}>Mar</th>
              <th style={{ textAlign: 'center' }}>Mie</th>
              <th style={{ textAlign: 'center' }}>Jue</th>
              <th style={{ textAlign: 'center' }}>Vie</th>
              <th style={{ textAlign: 'center' }}>Sab</th>
              <th>Nv. Servicio</th>
              <th>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className="loading">Cargando...</td></tr>
            ) : error ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#991b1b', padding: 20 }}>{error}</td></tr>
            ) : data?.rows.length === 0 ? (
              <tr><td colSpan={12} className="empty">Sin resultados.</td></tr>
            ) : data?.rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{r.ceve}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.item}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.producto}</td>
                <td style={{ textAlign: 'right' }}>{r.cupo}</td>
                <td style={{ textAlign: 'center' }}>{r.lun || '—'}</td>
                <td style={{ textAlign: 'center' }}>{r.mar || '—'}</td>
                <td style={{ textAlign: 'center' }}>{r.mie || '—'}</td>
                <td style={{ textAlign: 'center' }}>{r.jue || '—'}</td>
                <td style={{ textAlign: 'center' }}>{r.vie || '—'}</td>
                <td style={{ textAlign: 'center' }}>{r.sab || '—'}</td>
                <td>{r.nvServicio}</td>
                <td style={{ fontSize: 11, color: '#6b7280' }}>{fmtDT(r.actualizadoEn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button className="btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Anterior</button>
          <span style={{ fontSize: 13, color: '#6b7280', lineHeight: '30px' }}>Pág {page} / {totalPages}</span>
          <button className="btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Siguiente ›</button>
        </div>
      )}
    </div>
  )
}

// ── Hub Pedidos tab ──────────────────────────────────────────────────────────
const DAYS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const DAY_KEYS = ['transportSunday','transportMonday','transportTuesday','transportWednesday','transportThursday','transportFriday','transportSaturday']

function TabHub() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [inputVal, setInputVal] = useState('')
  const timer = useRef(null)

  const load = useCallback(async (p, s) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ page: p, pageSize: PAGE_SIZE, ...(s ? { search: s } : {}) })
      const r = await fetch(`${API}/api/frecuencias/hub?${params}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData(await r.json())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page, search) }, [page, search, load])

  const handleSearch = (val) => {
    setInputVal(val)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setPage(1); setSearch(val) }, 400)
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  const lastUpdated = data?.lastUpdated
  const lastDate    = lastUpdated ? new Date(lastUpdated) : null
  const hoursAgo    = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 3_600_000) : null
  const alertColor  = hoursAgo == null ? null : hoursAgo > 72 ? '#fef2f2' : hoursAgo > 24 ? '#fffbeb' : '#ecfdf5'
  const alertBorder = hoursAgo == null ? null : hoursAgo > 72 ? '#fca5a5' : hoursAgo > 24 ? '#fcd34d' : '#6ee7b7'
  const alertText   = hoursAgo == null ? null : hoursAgo > 72 ? '#991b1b' : hoursAgo > 24 ? '#92400e' : '#065f46'

  return (
    <div>
      {lastDate && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 8, fontSize: 13,
          background: alertColor, border: `1px solid ${alertBorder}`, color: alertText, marginBottom: 14 }}>
          <span style={{ fontWeight: 700 }}>⏱ Última actualización HubPedidos:</span>
          <span>{fmtDT(lastUpdated)}</span>
          {hoursAgo != null && <span style={{ opacity: 0.75 }}>({hoursAgo < 1 ? 'hace menos de 1h' : `hace ${hoursAgo}h`})</span>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <input
          value={inputVal}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Buscar CeVe, ItemCode o Producto..."
          style={{ flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
        />
        {data && <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{data.total.toLocaleString()} registros</span>}
      </div>

      <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto', overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Org</th>
              <th style={{ textAlign: 'right' }}>CeVe</th>
              <th>Item</th>
              <th>Producto</th>
              <th>Almacén</th>
              <th>Frec. Transporte</th>
              {DAYS_ES.map(d => <th key={d} style={{ textAlign: 'center', minWidth: 36 }}>{d}</th>)}
              <th style={{ textAlign: 'right' }}>Frec</th>
              <th style={{ textAlign: 'center' }}>Activo</th>
              <th>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} className="loading">Cargando...</td></tr>
            ) : error ? (
              <tr><td colSpan={14} style={{ textAlign: 'center', color: '#991b1b', padding: 20 }}>{error}</td></tr>
            ) : data?.rows.length === 0 ? (
              <tr><td colSpan={14} className="empty">Sin resultados.</td></tr>
            ) : data?.rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontSize: 11 }}>{r.orgCode}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.salecenterCode}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.itemCode}</td>
                <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.longName}</td>
                <td>{r.warehouseCode}</td>
                <td style={{ fontSize: 12 }}>{r.transportFrequencySummary}</td>
                {DAY_KEYS.map(k => <td key={k} style={{ textAlign: 'center' }}>{dayDot(r[k])}</td>)}
                <td style={{ textAlign: 'right' }}>{r.transportFrequency}</td>
                <td style={{ textAlign: 'center' }}>{r.active === true || r.active === 'true' || r.active === 1 ? '✓' : '—'}</td>
                <td style={{ fontSize: 11, color: '#6b7280' }}>{fmtDT(r.actualizadoAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button className="btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Anterior</button>
          <span style={{ fontSize: 13, color: '#6b7280', lineHeight: '30px' }}>Pág {page} / {totalPages}</span>
          <button className="btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Siguiente ›</button>
        </div>
      )}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function CatalogoMetas() {
  const [tab, setTab] = useState('imweb')

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Frecuencias Producto CeVes</div>
          <div className="topbar-sub">Consulta de frecuencias por fuente de datos</div>
        </div>
      </div>

      <div className="content">
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
          {[
            { key: 'imweb', label: '🔷 Imweb',       sub: 'CatalogoCuposImweb' },
            { key: 'hub',   label: '🟦 Hub Pedidos',  sub: 'FrecuenciaTransportacion' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: 'none', borderBottom: tab === t.key ? '2px solid #1a56db' : '2px solid transparent',
                marginBottom: -2, background: 'transparent',
                color: tab === t.key ? '#1a56db' : '#6b7280',
                transition: 'color 0.15s',
              }}
            >
              {t.label}
              <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9ca3af', marginTop: 1 }}>{t.sub}</span>
            </button>
          ))}
        </div>

        {tab === 'imweb' ? <TabImweb /> : <TabHub />}
      </div>
    </>
  )
}
