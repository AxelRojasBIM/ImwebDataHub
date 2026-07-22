import { useState, useEffect, useCallback } from 'react'
import { API } from '../App'

const CAUSA_STYLES = {
  'Recorte Fabrica':                  { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  'Consumo arriba del promedio':      { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  'Sin causa identificada':           { bg: '#f3f4f6', border: '#e5e7eb', text: '#4b5563' },
  'Producto sin planeación en torre': { bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6' },
}
const CAUSA_OPTS = Object.keys(CAUSA_STYLES)

const GROUP_FIELDS = [
  { key: 'fecha',     label: 'Fecha',     width: 110 },
  { key: 'ceve',      label: 'CeVe',      width: 220 },
  { key: 'item',      label: 'Item',      width: 260 },
  { key: 'categoria', label: 'Categoría', width: 160 },
  { key: 'canal',     label: 'Canal',     width: 140 },
]

const HEADER_H = 40

function CausaBadge({ causa, small }) {
  if (!causa) return <span style={{ color: '#9ca3af' }}>—</span>
  const s = CAUSA_STYLES[causa] || CAUSA_STYLES['Sin causa identificada']
  return (
    <span style={{
      display: 'inline-block', padding: small ? '1px 8px' : '3px 10px', borderRadius: 99,
      fontSize: small ? 11 : 12, fontWeight: 600,
      background: s.bg, border: `1px solid ${s.border}`, color: s.text,
      whiteSpace: 'nowrap',
    }}>{causa}</span>
  )
}

function fmtNum(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 })
}
function fmtMoney(v) {
  if (v == null) return '—'
  return '$' + Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 })
}

const PAGE_SIZE = 100

export default function CausasRecorteTablero() {
  const [filtros, setFiltros] = useState({ ceves: [], canales: [], categorias: [] })
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin]       = useState('')
  const [codigoCeve, setCodigoCeve]   = useState('')
  const [canal, setCanal]             = useState('')
  const [causa, setCausa]             = useState('')
  const [categoria, setCategoria]     = useState('')
  const [groupBy, setGroupBy]         = useState([])
  const [page, setPage]               = useState(1)
  const [sortBy, setSortBy]           = useState(null)
  const [sortDir, setSortDir]         = useState('desc')

  const [data, setData]       = useState({ total: 0, totalRecortePzs: 0, totalRecorteUsd: 0, rows: [] })
  const [loading, setLoading] = useState(false)

  // Top N
  const [topNOpen, setTopNOpen]     = useState(false)
  const [topNActive, setTopNActive] = useState(false)
  const [topNCategoria, setTopNCategoria] = useState('')
  const [topProductos, setTopProductos]   = useState(10)
  const [topCeves, setTopCeves]           = useState(2)
  const [topUnidad, setTopUnidad]         = useState('pzs')
  const [topOrden, setTopOrden]           = useState('desc')
  const [topNData, setTopNData]           = useState(null)
  const [topNLoading, setTopNLoading]     = useState(false)
  const [topNError, setTopNError]         = useState(null)

  const fechasListas = !!fechaInicio && !!fechaFin

  useEffect(() => {
    fetch(`${API}/api/causas-recorte/filtros`)
      .then(r => r.ok ? r.json() : {})
      .then(d => setFiltros({ ceves: [], canales: [], categorias: [], ...d }))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!fechasListas) { setData({ total: 0, totalRecortePzs: 0, totalRecorteUsd: 0, rows: [] }); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), fechaInicio, fechaFin })
      if (codigoCeve)  params.set('codigoCeve', codigoCeve)
      if (canal)       params.set('canal', canal)
      if (causa)       params.set('causa', causa)
      if (categoria)   params.set('categoria', categoria)
      if (sortBy)      { params.set('sortBy', sortBy); params.set('sortDir', sortDir) }

      const endpoint = groupBy.length > 0
        ? `${API}/api/causas-recorte/tablero-agrupado?groupBy=${groupBy.join(',')}&${params}`
        : `${API}/api/causas-recorte/tablero?${params}`

      const r = await fetch(endpoint)
      if (r.ok) setData(await r.json())
    } catch {}
    finally { setLoading(false) }
  }, [fechasListas, page, fechaInicio, fechaFin, codigoCeve, canal, causa, categoria, groupBy, sortBy, sortDir])

  useEffect(() => { if (!topNActive) load() }, [load, topNActive])

  function handleFiltrar() {
    setTopNActive(false)
    setPage(1)
    load()
  }
  function handleLimpiar() {
    setFechaInicio(''); setFechaFin(''); setCodigoCeve(''); setCanal(''); setCausa(''); setCategoria('')
    setGroupBy([]); setSortBy(null); setSortDir('desc'); setPage(1); setTopNActive(false)
  }
  function toggleGroup(key) {
    setTopNActive(false)
    setGroupBy(g => g.includes(key) ? g.filter(k => k !== key) : [...g, key])
    setPage(1)
  }
  function handleSort(key) {
    if (!key) return
    if (sortBy === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(key)
      setSortDir('desc')
    }
    setPage(1)
  }

  async function handleAplicarTopN() {
    if (!topNCategoria) { setTopNError('Selecciona una categoría.'); return }
    setTopNLoading(true); setTopNError(null)
    try {
      const params = new URLSearchParams({
        categoria: topNCategoria, topProductos: String(topProductos), topCeves: String(topCeves),
        unidad: topUnidad, orden: topOrden,
      })
      if (fechaInicio) params.set('fechaInicio', fechaInicio)
      if (fechaFin)    params.set('fechaFin', fechaFin)
      if (canal)        params.set('canal', canal)
      if (causa)        params.set('causa', causa)
      const r = await fetch(`${API}/api/causas-recorte/top-n?${params}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setTopNData(d)
      setTopNActive(true)
    } catch (e) {
      setTopNError(e.message)
    } finally {
      setTopNLoading(false)
    }
  }
  function handleSalirTopN() {
    setTopNActive(false)
    setTopNData(null)
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const rangeStart = data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd   = Math.min(page * PAGE_SIZE, data.total)
  const agrupado = groupBy.length > 0
  const activeGroupFields = GROUP_FIELDS.filter(f => groupBy.includes(f.key))

  const columns = agrupado
    ? [
        ...activeGroupFields.map(f => ({ key: f.key, label: f.label, width: f.width, align: 'left' })),
        { key: 'filas', label: 'Filas', width: 90, align: 'right' },
        { key: 'recortePzs', label: 'Recorte Pzs', width: 120, align: 'right' },
        { key: 'recorteUsd', label: 'Recorte $', width: 130, align: 'right' },
        { key: 'causaPredominante', label: 'Causa Predominante', width: 200, align: 'left' },
        { key: 'causaSecundaria', label: 'Causa Secundaria', width: 200, align: 'left' },
      ]
    : [
        { key: 'fecha', label: 'Fecha', width: 100, align: 'left' },
        { key: 'ceve', label: 'CeVe', width: 140, align: 'left' },
        { key: 'item', label: 'Item', width: 90, align: 'left' },
        { key: 'producto', label: 'Producto', width: 200, align: 'left' },
        { key: 'canal', label: 'Canal', width: 110, align: 'left' },
        { key: 'recortePzs', label: 'Recorte Pzs', width: 110, align: 'right' },
        { key: 'recorteUsd', label: 'Recorte $', width: 110, align: 'right' },
        { key: 'causaPrincipal', label: 'Causa Principal', width: 170, align: 'left' },
        { key: 'causaSecundaria', label: 'Causa Secundaria', width: 170, align: 'left' },
        { key: null, label: 'Resumen', width: 380, align: 'left' },
      ]

  const topNColumns = [
    { label: '#', width: 40, align: 'right' },
    { label: 'Producto', width: 260, align: 'left' },
    { label: 'Total Producto Pzs', width: 140, align: 'right' },
    { label: 'Total Producto $', width: 140, align: 'right' },
    { label: 'CeVe', width: 200, align: 'left' },
    { label: 'Recorte Pzs', width: 120, align: 'right' },
    { label: 'Recorte $', width: 130, align: 'right' },
    { label: 'Causa Predominante', width: 200, align: 'left' },
  ]

  return (
    <div style={{ width: '100%', height: '100%', padding: '20px 28px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
          Causas Recorte
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
          Detalle de recortes con la causa diagnosticada (Recorte Fábrica vs. Consumo arriba del promedio).
        </p>
      </div>

      {/* Filtros */}
      <div style={{
        background: '#f8faff', border: '1px solid #c7d7fd', borderRadius: 14,
        padding: '18px 22px', marginBottom: 16, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Desde *
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Hasta *
            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            CeVe
            <select value={codigoCeve} onChange={e => setCodigoCeve(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 160 }}>
              <option value="">Todos</option>
              {filtros.ceves.map(c => <option key={c.codigoCeve} value={c.codigoCeve}>{c.ceve}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Canal
            <select value={canal} onChange={e => setCanal(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 140 }}>
              <option value="">Todos</option>
              {filtros.canales.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Categoría
            <select value={categoria} onChange={e => setCategoria(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 160 }}>
              <option value="">Todas</option>
              {filtros.categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Causa
            <select value={causa} onChange={e => setCausa(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 220 }}>
              <option value="">Todas</option>
              {CAUSA_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button className="btn primary" onClick={handleFiltrar}
            style={{ padding: '8px 22px', fontWeight: 700, fontSize: 13, height: 36 }}>
            Filtrar
          </button>
          <button onClick={handleLimpiar}
            style={{ padding: '8px 16px', height: 36, fontSize: 13, borderRadius: 8, background: '#fff',
              border: '1px solid var(--border)', color: '#6b7280', cursor: 'pointer' }}>
            Limpiar
          </button>
        </div>

        {/* Agrupar por */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid #dbe4fb' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Agrupar por:</span>
          {GROUP_FIELDS.map(f => (
            <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={groupBy.includes(f.key)} onChange={() => toggleGroup(f.key)}
                style={{ width: 15, height: 15, cursor: 'pointer' }} />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      {/* Top N */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 16, flexShrink: 0, overflow: 'hidden' }}>
        <div onClick={() => setTopNOpen(o => !o)}
          style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: '#f9fafb' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
            📊 Análisis Top N {topNActive && <span style={{ color: '#2563eb', marginLeft: 6 }}>(activo)</span>}
          </span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{topNOpen ? '▲ ocultar' : '▼ mostrar'}</span>
        </div>
        {topNOpen && (
          <div style={{ padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
              Categoría *
              <select value={topNCategoria} onChange={e => setTopNCategoria(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 180 }}>
                <option value="">Selecciona…</option>
                {filtros.categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
              Top productos
              <input type="number" min={1} max={100} value={topProductos} onChange={e => setTopProductos(Number(e.target.value) || 1)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 80 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
              CeVes por producto
              <input type="number" min={1} max={50} value={topCeves} onChange={e => setTopCeves(Number(e.target.value) || 1)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 80 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
              Unidad
              <select value={topUnidad} onChange={e => setTopUnidad(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}>
                <option value="pzs">Piezas</option>
                <option value="usd">Pesos ($)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
              Orden
              <select value={topOrden} onChange={e => setTopOrden(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}>
                <option value="desc">Mayor a menor</option>
                <option value="asc">Menor a mayor</option>
              </select>
            </label>
            <button className="btn primary" onClick={handleAplicarTopN} disabled={topNLoading}
              style={{ padding: '8px 22px', fontWeight: 700, fontSize: 13, height: 36 }}>
              {topNLoading ? '⏳ Calculando…' : 'Aplicar Top N'}
            </button>
            {topNActive && (
              <button onClick={handleSalirTopN}
                style={{ padding: '8px 16px', height: 36, fontSize: 13, borderRadius: 8, background: '#fff',
                  border: '1px solid var(--border)', color: '#6b7280', cursor: 'pointer' }}>
                Salir de Top N
              </button>
            )}
            {topNError && <span style={{ fontSize: 12, color: '#991b1b' }}>{topNError}</span>}
          </div>
        )}
      </div>

      {/* Tabla */}
      {topNActive && topNData ? (
        <div style={{ flex: 1, overflow: 'auto', borderRadius: 12, border: '1px solid var(--border)', minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#2563eb' }}>
                {topNColumns.map(col => (
                  <th key={col.label} style={{ padding: '11px 14px', width: col.width, textAlign: col.align, fontWeight: 700,
                    color: '#fff', whiteSpace: 'nowrap', fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase',
                    position: 'sticky', top: 0, background: '#2563eb', zIndex: 1 }}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                let lastItem = null, rank = 0
                return topNData.rows.map((row, i) => {
                  const isNewItem = row.item !== lastItem
                  if (isNewItem) { rank++; lastItem = row.item }
                  const cellStyle = { padding: '9px 14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', height: 38 }
                  return (
                    <tr key={`${row.item}-${row.codigoCeve}-${i}`} style={{
                      borderBottom: '1px solid var(--border)',
                      borderTop: isNewItem && i > 0 ? '2px solid #c7d7fd' : undefined,
                      background: rank % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...cellStyle, textAlign: 'right', color: '#9ca3af' }}>{isNewItem ? rank : ''}</td>
                      <td style={cellStyle} title={row.descripcion}>{isNewItem ? `${row.item} - ${row.descripcion || ''}` : ''}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', color: isNewItem ? 'inherit' : '#d1d5db' }}>{isNewItem ? fmtNum(row.itemTotalPzs) : ''}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', color: isNewItem ? 'inherit' : '#d1d5db' }}>{isNewItem ? fmtMoney(row.itemTotalUsd) : ''}</td>
                      <td style={cellStyle} title={row.ceve}>{row.ceve || row.codigoCeve}</td>
                      <td style={{ ...cellStyle, fontWeight: 600, textAlign: 'right' }}>{fmtNum(row.recortePzs)}</td>
                      <td style={{ ...cellStyle, fontWeight: 600, textAlign: 'right' }}>{fmtMoney(row.recorteUsd)}</td>
                      <td style={cellStyle}><CausaBadge causa={row.causaPredominante} /></td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
      ) : !fechasListas ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Selecciona un rango de fechas (Desde / Hasta) para ver los datos.
        </div>
      ) : loading ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '24px 0' }}>Cargando…</div>
      ) : data.rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Sin resultados para estos filtros.
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflow: 'auto', borderRadius: 12, border: '1px solid var(--border)', minHeight: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#2563eb' }}>
                  {columns.map(col => {
                    const active = sortBy === col.key
                    return (
                      <th key={col.label} onClick={() => handleSort(col.key)}
                        style={{ padding: '11px 14px', width: col.width, textAlign: col.align, fontWeight: 700,
                          color: '#fff', whiteSpace: 'nowrap', fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase',
                          position: 'sticky', top: 0, background: '#2563eb', zIndex: 2, height: HEADER_H, boxSizing: 'border-box',
                          cursor: col.key ? 'pointer' : 'default', userSelect: 'none' }}>
                        {col.label}
                        {col.key && (
                          <span style={{ marginLeft: 5, opacity: active ? 1 : 0.35, fontSize: 10 }}>
                            {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                          </span>
                        )}
                      </th>
                    )
                  })}
                </tr>
                {/* Fila de totales — inamovible (sticky) justo debajo del encabezado */}
                <tr style={{ background: '#eef2ff' }}>
                  {columns.map((col, idx) => {
                    let content = ''
                    if (idx === 0) content = 'TOTAL'
                    else if (col.key === 'recortePzs') content = fmtNum(data.totalRecortePzs)
                    else if (col.key === 'recorteUsd') content = fmtMoney(data.totalRecorteUsd)
                    else if (col.key === 'filas') content = data.total.toLocaleString()
                    return (
                      <td key={col.label} style={{ padding: '8px 14px', textAlign: col.align, fontWeight: 700,
                        color: '#1e3a8a', fontSize: 12.5, whiteSpace: 'nowrap', borderBottom: '2px solid #c7d7fd',
                        position: 'sticky', top: HEADER_H, background: '#eef2ff', zIndex: 1 }}>{content}</td>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {agrupado ? data.rows.map((row, i) => {
                  const key = activeGroupFields.map(f => row[f.key]).join('|') + '-' + i
                  const cellStyle = { padding: '9px 14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', height: 38 }
                  return (
                    <tr key={key} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      {activeGroupFields.map(f => (
                        <td key={f.key} style={cellStyle} title={row[f.key]}>{row[f.key] ?? '—'}</td>
                      ))}
                      <td style={{ ...cellStyle, textAlign: 'right' }}>{row.filas?.toLocaleString()}</td>
                      <td style={{ ...cellStyle, fontWeight: 600, textAlign: 'right' }}>{fmtNum(row.recortePzs)}</td>
                      <td style={{ ...cellStyle, fontWeight: 600, textAlign: 'right' }}>{fmtMoney(row.recorteUsd)}</td>
                      <td style={cellStyle}><CausaBadge causa={row.causaPredominante} /></td>
                      <td style={cellStyle}><CausaBadge causa={row.causaSecundaria} small /></td>
                    </tr>
                  )
                }) : data.rows.map((row, i) => {
                  const key = `${row.codigoCeve}-${row.item}-${row.fechaVenta}-${row.canal}-${i}`
                  const cellStyle = { padding: '9px 14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', height: 38 }
                  return (
                    <tr key={key} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={cellStyle}>{row.fechaVenta}</td>
                      <td style={cellStyle} title={row.ceve || row.codigoCeve}>{row.ceve || row.codigoCeve}</td>
                      <td style={cellStyle}>{row.item}</td>
                      <td style={cellStyle} title={row.descripcion}>{row.descripcion || '—'}</td>
                      <td style={cellStyle}>{row.canal || '—'}</td>
                      <td style={{ ...cellStyle, fontWeight: 600, textAlign: 'right' }}>{fmtNum(row.recortePzs)}</td>
                      <td style={{ ...cellStyle, fontWeight: 600, textAlign: 'right' }}>{fmtMoney(row.recorteUsd)}</td>
                      <td style={cellStyle}><CausaBadge causa={row.causaPrincipal} /></td>
                      <td style={cellStyle}><CausaBadge causa={row.causaSecundaria} small /></td>
                      <td style={{ ...cellStyle, fontSize: 12.5, color: '#4b5563' }} title={row.resumen}>{row.resumen || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: 13, color: '#6b7280', flexShrink: 0 }}>
            <div>Mostrando {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} de {data.total.toLocaleString()} {agrupado ? 'grupos' : 'filas'} · Página {page} de {totalPages}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff',
                  cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>
                ← Anterior
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff',
                  cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}>
                Siguiente →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
