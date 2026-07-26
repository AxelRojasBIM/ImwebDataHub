import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
const MIN_COL_WIDTH = 60

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
function fmtDateShort(iso) {
  if (!iso) return null
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const PAGE_SIZE = 100
const SUBHEADER_H = 36

// Detalle día por día (solo tiene sentido cuando la vista está en un solo día,
// porque ahí las fechas de tránsito son las mismas para todas las filas).
const DIA_METRICS_RECORTE = ['Pedido', 'Entregado', 'Recorte', 'Aumento']
const DIA_METRICS_CONSUMO = ['Cargo Real', 'Cargo Prom.', 'Exceso', 'Ahorro']

function recorteFabricaValue(row, dayIdx, metric) {
  const pedido = dayIdx < 6 ? row.pedidoFabrica?.[dayIdx] : row.hoyPedido
  const entregado = dayIdx < 6 ? row.embarqueReal?.[dayIdx] : row.hoyEntregado
  if (pedido == null && entregado == null) return null
  const diff = (entregado ?? 0) - (pedido ?? 0)
  if (metric === 'Pedido') return pedido
  if (metric === 'Entregado') return entregado
  if (metric === 'Recorte') return diff < 0 ? -diff : 0
  if (metric === 'Aumento') return diff > 0 ? diff : 0
  return null
}
function consumoValue(row, dayIdx, metric) {
  const real = row.cargoReal?.[dayIdx]
  const prom = row.cargoPromedio?.[dayIdx]
  if (real == null && prom == null) return null
  const diff = (real ?? 0) - (prom ?? 0)
  if (metric === 'Cargo Real') return real
  if (metric === 'Cargo Prom.') return prom
  if (metric === 'Exceso') return diff > 0 ? diff : 0
  if (metric === 'Ahorro') return diff < 0 ? -diff : 0
  return null
}

// Maneja orden (arrastrar encabezado) y ancho (arrastrar el borde derecho) de columnas,
// solo en memoria — se resetea al recargar la página, como se pidió.
function useColumnLayout(baseColumns) {
  const keyOf = (c) => c.key ?? c.label
  const [order, setOrder] = useState(() => baseColumns.map(keyOf))
  const [widths, setWidths] = useState(() => Object.fromEntries(baseColumns.map(c => [keyOf(c), c.width])))
  const [dragOverKey, setDragOverKey] = useState(null)
  const dragKeyRef = useRef(null)
  const suppressClickRef = useRef(false)
  const customizedRef = useRef(false)
  const baseKeysSignature = baseColumns.map(keyOf).join('|')

  useEffect(() => {
    const baseKeys = baseColumns.map(keyOf)
    setOrder(prev => {
      // Antes de que el usuario reordene algo, sigue el orden natural de las
      // columnas activas (p. ej. al marcar/desmarcar "Agrupar por"). Una vez que
      // arrastra para reordenar, se respeta su orden y las columnas nuevas se
      // agregan al final en vez de reacomodar todo.
      if (!customizedRef.current) return baseKeys
      const kept = prev.filter(k => baseKeys.includes(k))
      const added = baseKeys.filter(k => !kept.includes(k))
      return kept.length === baseKeys.length && added.length === 0 ? prev : [...kept, ...added]
    })
    setWidths(prev => {
      const next = { ...prev }
      let changed = false
      baseColumns.forEach(c => { const k = keyOf(c); if (next[k] == null) { next[k] = c.width; changed = true } })
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKeysSignature])

  const byKey = useMemo(() => Object.fromEntries(baseColumns.map(c => [keyOf(c), c])), [baseColumns])
  const orderedColumns = order.map(k => byKey[k]).filter(Boolean)

  function startResize(key, e) {
    e.preventDefault()
    e.stopPropagation()
    suppressClickRef.current = true
    const startX = e.clientX
    const startWidth = widths[key] ?? byKey[key]?.width ?? 120
    function onMove(ev) {
      const delta = ev.clientX - startX
      setWidths(w => ({ ...w, [key]: Math.max(MIN_COL_WIDTH, Math.round(startWidth + delta)) }))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setTimeout(() => { suppressClickRef.current = false }, 0)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleDragStart(key) { dragKeyRef.current = key }
  function handleDragOver(key, e) { e.preventDefault(); setDragOverKey(key) }
  function handleDrop(targetKey) {
    const from = dragKeyRef.current
    dragKeyRef.current = null
    setDragOverKey(null)
    if (!from || from === targetKey) return
    customizedRef.current = true
    setOrder(prev => {
      const next = prev.filter(k => k !== from)
      const idx = next.indexOf(targetKey)
      next.splice(idx, 0, from)
      return next
    })
  }
  function handleDragEnd() { dragKeyRef.current = null; setDragOverKey(null) }

  return {
    orderedColumns, widths, dragOverKey, suppressClickRef,
    startResize, handleDragStart, handleDragOver, handleDrop, handleDragEnd,
  }
}

function HeaderCell({ col, width, active, sortDir, onSort, layout, rowSpan }) {
  const key = col.key ?? col.label
  const isDragOver = layout.dragOverKey === key
  return (
    <th
      rowSpan={rowSpan}
      draggable
      onDragStart={() => layout.handleDragStart(key)}
      onDragOver={(e) => layout.handleDragOver(key, e)}
      onDrop={() => layout.handleDrop(key)}
      onDragEnd={layout.handleDragEnd}
      onClick={() => { if (!layout.suppressClickRef.current) onSort?.(col.key) }}
      title="Arrastra para reordenar · arrastra el borde derecho para cambiar el ancho"
      style={{
        padding: '11px 14px', width, textAlign: col.align, fontWeight: 700,
        color: '#fff', whiteSpace: 'nowrap', fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase',
        position: 'sticky', top: 0, background: isDragOver ? '#1d4ed8' : '#2563eb',
        zIndex: 2, height: HEADER_H, boxSizing: 'border-box', overflow: 'hidden',
        cursor: onSort && col.key ? 'pointer' : 'grab', userSelect: 'none',
      }}>
      {col.label}
      {onSort && col.key && (
        <span style={{ marginLeft: 5, opacity: active ? 1 : 0.35, fontSize: 10 }}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      )}
      <div
        onMouseDown={(e) => layout.startResize(key, e)}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 3 }}
      />
    </th>
  )
}

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

  // Todos los filtros aplican de inmediato (reactivo) — cambiar cualquiera
  // resetea la página y sale del modo Top N (que quedó calculado con filtros viejos).
  function updateFilter(setter) {
    return (value) => { setTopNActive(false); setPage(1); setter(value) }
  }
  const updateFechaInicio = updateFilter(setFechaInicio)
  const updateFechaFin    = updateFilter(setFechaFin)
  const updateCodigoCeve  = updateFilter(setCodigoCeve)
  const updateCanal       = updateFilter(setCanal)
  const updateCausa       = updateFilter(setCausa)
  const updateCategoria   = updateFilter(setCategoria)

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

  // El detalle día por día solo tiene sentido acotado a un solo día (Desde = Hasta):
  // ahí las fechas de tránsito son las mismas para todas las filas, aunque los
  // valores (Pedido, Entregado, etc.) sigan siendo distintos por fila.
  const showDetalleDia = !agrupado && !topNActive && !!fechaInicio && fechaInicio === fechaFin
  const sampleRow = data.rows.find(r => r.fechaTransito && r.fechaTransito.some(d => d))
  const diaDates = sampleRow ? sampleRow.fechaTransito : [null, null, null, null, null, null]
  function dayLabel(idx) {
    if (idx === 6) return 'Hoy'
    return fmtDateShort(diaDates[idx]) || `Día ${idx + 1}`
  }
  const recorteDayCols = [0, 1, 2, 3, 4, 5, 6]
  const consumoDayCols = [0, 1, 2, 3, 4, 5]
  const recorteColCount = recorteDayCols.length * DIA_METRICS_RECORTE.length
  const consumoColCount = consumoDayCols.length * DIA_METRICS_CONSUMO.length

  const detailColumnsBase = useMemo(() => [
    { key: 'fecha', label: 'Fecha', width: 100, align: 'left' },
    { key: 'ceve', label: 'CeVe', width: 140, align: 'left' },
    { key: 'item', label: 'Item', width: 90, align: 'left' },
    { key: 'producto', label: 'Producto', width: 200, align: 'left' },
    { key: 'canal', label: 'Canal', width: 110, align: 'left' },
    { key: 'recortePzs', label: 'Recorte Pzs', width: 110, align: 'right' },
    { key: 'recorteUsd', label: 'Recorte $', width: 110, align: 'right' },
    { key: 'causaPrincipal', label: 'Causa Principal', width: 170, align: 'left' },
    { key: 'causaSecundaria', label: 'Causa Secundaria', width: 170, align: 'left' },
    { key: 'resumen', label: 'Resumen', width: 380, align: 'left', sortable: false },
    { key: 'envsPlanta', label: 'Recorte Planta (Envs)', width: 170, align: 'right' },
    { key: 'envsConsumo', label: 'Recorte Consumo (Envs)', width: 180, align: 'right' },
  ], [])

  const groupedColumnsBase = useMemo(() => [
    ...activeGroupFields.map(f => ({ key: f.key, label: f.label, width: f.width, align: 'left' })),
    { key: 'filas', label: 'Filas', width: 90, align: 'right' },
    { key: 'recortePzs', label: 'Recorte Pzs', width: 120, align: 'right' },
    { key: 'recorteUsd', label: 'Recorte $', width: 130, align: 'right' },
    { key: 'causaPredominante', label: 'Causa Predominante', width: 200, align: 'left' },
    { key: 'causaSecundaria', label: 'Causa Secundaria', width: 200, align: 'left' },
    { key: 'resumen', label: 'Resumen', width: 380, align: 'left', sortable: false },
    { key: 'envsPlanta', label: 'Recorte Planta (Envs)', width: 170, align: 'right' },
    { key: 'envsConsumo', label: 'Recorte Consumo (Envs)', width: 180, align: 'right' },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [groupBy.join(',')])

  const topNColumnsBase = useMemo(() => [
    { key: 'rank', label: '#', width: 40, align: 'right' },
    { key: 'producto', label: 'Producto', width: 260, align: 'left' },
    { key: 'itemTotalPzs', label: 'Total Producto Pzs', width: 140, align: 'right' },
    { key: 'itemTotalUsd', label: 'Total Producto $', width: 140, align: 'right' },
    { key: 'ceve', label: 'CeVe', width: 220, align: 'left' },
    { key: 'recortePzs', label: 'Recorte Pzs', width: 120, align: 'right' },
    { key: 'recorteUsd', label: 'Recorte $', width: 130, align: 'right' },
    { key: 'causaPredominante', label: 'Causa Predominante', width: 200, align: 'left' },
    { key: 'resumen', label: 'Resumen', width: 380, align: 'left' },
    { key: 'envsPlanta', label: 'Recorte Planta (Envs)', width: 170, align: 'right' },
    { key: 'envsConsumo', label: 'Recorte Consumo (Envs)', width: 180, align: 'right' },
  ], [])

  const detailLayout = useColumnLayout(detailColumnsBase)
  const groupedLayout = useColumnLayout(groupedColumnsBase)
  const topNLayout = useColumnLayout(topNColumnsBase)

  const layout = agrupado ? groupedLayout : detailLayout

  function renderMainCell(col, row) {
    const key = col.key
    if (agrupado && activeGroupFields.some(f => f.key === key)) {
      return <span title={row[key]}>{row[key] ?? '—'}</span>
    }
    switch (key) {
      case 'fecha': return row.fechaVenta
      case 'ceve': return <span title={row.ceve || row.codigoCeve}>{row.ceve || row.codigoCeve}</span>
      case 'item': return row.item
      case 'producto': return <span title={row.descripcion}>{row.descripcion || '—'}</span>
      case 'canal': return row.canal || '—'
      case 'filas': return row.filas?.toLocaleString()
      case 'recortePzs': return <span style={{ fontWeight: 600 }}>{fmtNum(row.recortePzs)}</span>
      case 'recorteUsd': return <span style={{ fontWeight: 600 }}>{fmtMoney(row.recorteUsd)}</span>
      case 'causaPrincipal': return <CausaBadge causa={row.causaPrincipal} />
      case 'causaPredominante': return <CausaBadge causa={row.causaPredominante} />
      case 'causaSecundaria': return <CausaBadge causa={row.causaSecundaria} small />
      case 'resumen': return <span title={row.resumen} style={{ fontSize: 12.5, color: '#4b5563' }}>{row.resumen || '—'}</span>
      case 'envsPlanta': return <span style={{ color: '#991b1b' }}>{fmtNum(row.envsPlanta)}</span>
      case 'envsConsumo': return <span style={{ color: '#92400e' }}>{fmtNum(row.envsConsumo)}</span>
      default: return null
    }
  }

  function renderTopNCell(col, row, isNewItem, rank) {
    switch (col.key) {
      case 'rank': return isNewItem ? rank : ''
      case 'producto': return isNewItem ? <span title={row.descripcion}>{`${row.item} - ${row.descripcion || ''}`}</span> : ''
      case 'itemTotalPzs': return isNewItem ? fmtNum(row.itemTotalPzs) : ''
      case 'itemTotalUsd': return isNewItem ? fmtMoney(row.itemTotalUsd) : ''
      case 'ceve': return <span title={`${row.codigoCeve ?? ''} - ${row.ceve ?? ''}`}>{row.codigoCeve}{row.ceve ? ` - ${row.ceve}` : ''}</span>
      case 'recortePzs': return <span style={{ fontWeight: 600 }}>{fmtNum(row.recortePzs)}</span>
      case 'recorteUsd': return <span style={{ fontWeight: 600 }}>{fmtMoney(row.recorteUsd)}</span>
      case 'causaPredominante': return <CausaBadge causa={row.causaPredominante} />
      case 'resumen': return <span title={row.resumen} style={{ fontSize: 12.5, color: '#4b5563' }}>{row.resumen || '—'}</span>
      case 'envsPlanta': return <span style={{ color: '#991b1b' }}>{fmtNum(row.envsPlanta)}</span>
      case 'envsConsumo': return <span style={{ color: '#92400e' }}>{fmtNum(row.envsConsumo)}</span>
      default: return null
    }
  }

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
            <input type="date" value={fechaInicio} onChange={e => updateFechaInicio(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Hasta *
            <input type="date" value={fechaFin} onChange={e => updateFechaFin(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            CeVe
            <select value={codigoCeve} onChange={e => updateCodigoCeve(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 160 }}>
              <option value="">Todos</option>
              {filtros.ceves.map(c => <option key={c.codigoCeve} value={c.codigoCeve}>{c.ceve}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Canal
            <select value={canal} onChange={e => updateCanal(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 140 }}>
              <option value="">Todos</option>
              {filtros.canales.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Categoría
            <select value={categoria} onChange={e => updateCategoria(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 160 }}>
              <option value="">Todas</option>
              {filtros.categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Causa
            <select value={causa} onChange={e => updateCausa(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 220 }}>
              <option value="">Todas</option>
              {CAUSA_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
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
                {topNLayout.orderedColumns.map(col => (
                  <HeaderCell key={col.key} col={col} width={topNLayout.widths[col.key] ?? col.width} layout={topNLayout} />
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
                      {topNLayout.orderedColumns.map(col => (
                        <td key={col.key} style={{ ...cellStyle, textAlign: col.align,
                          color: (col.key === 'itemTotalPzs' || col.key === 'itemTotalUsd' || col.key === 'rank') && !isNewItem ? '#d1d5db' : undefined }}>
                          {renderTopNCell(col, row, isNewItem, rank)}
                        </td>
                      ))}
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
              {showDetalleDia && (
                <colgroup>
                  {layout.orderedColumns.map(col => (
                    <col key={col.key} style={{ width: layout.widths[col.key] ?? col.width }} />
                  ))}
                  {recorteDayCols.flatMap(dayIdx => DIA_METRICS_RECORTE.map(metric => (
                    <col key={`rf-col-${dayIdx}-${metric}`} style={{ width: 62 }} />
                  )))}
                  {consumoDayCols.flatMap(dayIdx => DIA_METRICS_CONSUMO.map(metric => (
                    <col key={`co-col-${dayIdx}-${metric}`} style={{ width: 62 }} />
                  )))}
                </colgroup>
              )}
              <thead>
                <tr style={{ background: '#2563eb' }}>
                  {layout.orderedColumns.map(col => (
                    <HeaderCell key={col.key} col={col} width={layout.widths[col.key] ?? col.width}
                      active={sortBy === col.key} sortDir={sortDir} rowSpan={showDetalleDia ? 2 : 1}
                      onSort={col.sortable === false ? null : handleSort} layout={layout} />
                  ))}
                  {showDetalleDia && (
                    <>
                      <th colSpan={recorteColCount} style={{ textAlign: 'center', background: '#991b1b', color: '#fff',
                        fontWeight: 700, fontSize: 12, padding: '6px 4px', position: 'sticky', top: 0, zIndex: 2 }}>
                        Analisis_RecorteFabrica
                      </th>
                      <th colSpan={consumoColCount} style={{ textAlign: 'center', background: '#92400e', color: '#fff',
                        fontWeight: 700, fontSize: 12, padding: '6px 4px', position: 'sticky', top: 0, zIndex: 2 }}>
                        Analisis_Consumo
                      </th>
                    </>
                  )}
                </tr>
                {showDetalleDia && (
                  <tr style={{ background: '#2563eb' }}>
                    {recorteDayCols.flatMap(dayIdx => DIA_METRICS_RECORTE.map(metric => (
                      <th key={`rf-h-${dayIdx}-${metric}`} style={{ padding: '4px 3px', fontSize: 10, color: '#fff',
                        textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: HEADER_H, background: '#991b1b',
                        zIndex: 1, width: 62, height: SUBHEADER_H, boxSizing: 'border-box', overflow: 'hidden' }}>
                        <div>{dayLabel(dayIdx)}</div><div style={{ opacity: 0.85 }}>{metric}</div>
                      </th>
                    )))}
                    {consumoDayCols.flatMap(dayIdx => DIA_METRICS_CONSUMO.map(metric => (
                      <th key={`co-h-${dayIdx}-${metric}`} style={{ padding: '4px 3px', fontSize: 10, color: '#fff',
                        textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: HEADER_H, background: '#92400e',
                        zIndex: 1, width: 62, height: SUBHEADER_H, boxSizing: 'border-box', overflow: 'hidden' }}>
                        <div>{dayLabel(dayIdx)}</div><div style={{ opacity: 0.85 }}>{metric}</div>
                      </th>
                    )))}
                  </tr>
                )}
                {/* Fila de totales — inamovible (sticky) justo debajo del encabezado */}
                <tr style={{ background: '#eef2ff' }}>
                  {layout.orderedColumns.map((col, idx) => {
                    let content = ''
                    if (idx === 0) content = 'TOTAL'
                    else if (col.key === 'recortePzs') content = fmtNum(data.totalRecortePzs)
                    else if (col.key === 'recorteUsd') content = fmtMoney(data.totalRecorteUsd)
                    else if (col.key === 'filas') content = data.total.toLocaleString()
                    return (
                      <td key={col.key} style={{ padding: '8px 14px', textAlign: col.align, fontWeight: 700,
                        color: '#1e3a8a', fontSize: 12.5, whiteSpace: 'nowrap', borderBottom: '2px solid #c7d7fd',
                        position: 'sticky', top: showDetalleDia ? HEADER_H + SUBHEADER_H : HEADER_H, background: '#eef2ff', zIndex: 1 }}>{content}</td>
                    )
                  })}
                  {showDetalleDia && (
                    <td colSpan={recorteColCount + consumoColCount} style={{
                      position: 'sticky', top: HEADER_H + SUBHEADER_H, background: '#eef2ff', borderBottom: '2px solid #c7d7fd' }} />
                  )}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => {
                  const key = agrupado
                    ? activeGroupFields.map(f => row[f.key]).join('|') + '-' + i
                    : `${row.codigoCeve}-${row.item}-${row.fechaVenta}-${row.canal}-${i}`
                  const cellStyle = { padding: '9px 14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', height: 38 }
                  return (
                    <tr key={key} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      {layout.orderedColumns.map(col => (
                        <td key={col.key} style={{ ...cellStyle, textAlign: col.align }}>
                          {renderMainCell(col, row)}
                        </td>
                      ))}
                      {showDetalleDia && (
                        <>
                          {recorteDayCols.flatMap(dayIdx => DIA_METRICS_RECORTE.map(metric => {
                            const v = recorteFabricaValue(row, dayIdx, metric)
                            return (
                              <td key={`rf-${dayIdx}-${metric}`} style={{ padding: '6px 3px', textAlign: 'right', fontSize: 11.5,
                                whiteSpace: 'nowrap', overflow: 'hidden', color: metric === 'Recorte' ? '#991b1b' : metric === 'Aumento' ? '#166534' : '#374151' }}>
                                {fmtNum(v)}
                              </td>
                            )
                          }))}
                          {consumoDayCols.flatMap(dayIdx => DIA_METRICS_CONSUMO.map(metric => {
                            const v = consumoValue(row, dayIdx, metric)
                            return (
                              <td key={`co-${dayIdx}-${metric}`} style={{ padding: '6px 3px', textAlign: 'right', fontSize: 11.5,
                                whiteSpace: 'nowrap', overflow: 'hidden', color: metric === 'Exceso' ? '#92400e' : metric === 'Ahorro' ? '#166534' : '#374151' }}>
                                {fmtNum(v)}
                              </td>
                            )
                          }))}
                        </>
                      )}
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
