import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Search } from 'lucide-react'
import { API } from '../App'

const ROW0_H = 24 // banda estática de grupo ("PRODUCTO" / "TRÁNSITO") — solo indica a qué se refiere, no es clickeable
const ROW1_H = 26 // encabezado de columna individual / chip de día (clickeable en Tránsito)
const ROW2_H = 22 // sub-encabezado de métricas, solo visible en los días expandidos
const MIN_COL_WIDTH = 50
const DIA_COL_WIDTH = 78
const COLLAPSED_DAY_WIDTH = 100
const DIA_METRICS = ['Pedido Fábrica', 'Carga Prom', 'Existencia Teórica']
const STICKY_UPTO_KEY = 'producto'
const HDR_DIVIDER_SOFT = '1px solid #dbeafe'
const PAGE_SIZE = 100
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Paleta tomada del tablero de referencia (Order Tower / Validación de Pedido):
// la banda de grupo (fila 0) es oscura con texto blanco — solo un rótulo, no
// es clickeable. Los encabezados de columna individuales (fila 1) usan fondo
// CLARO con texto oscuro, variando por área semántica (blanco para las
// columnas normales, ámbar clarito para la columna de referencia manual). El
// azul es el color de Tránsito específicamente (los chips de día, que sí son
// clickeables) — el verde oscuro de la referencia original es de otro grupo
// ("Inventario Óptimo") que no existe en esta tabla.
const HEADER_BG = '#1a2e38'
const TOTAL_BG = '#1a2e4a'
const TRANSITO_BG = '#2563eb'
const TRANSITO_METRIC_BG = '#eff6ff'
const HEADER_COL_BG = '#eff6ff'
const AMBER = '#d97706'
const AMBER_LIGHT = '#fef3c7'
const BLUE_PRIMARY = '#2563eb'
const PAGE_GRAY = '#f1f5f9'
const MUTED_GRAY = '#64748b'
const HEADER_TEXT = '#374151'
const TEXT_MAIN = '#1e293b'
const ZERO_GRAY = '#cbd5e1'

// "Validador de Pedido" — apartado aparte de Tránsito, con los campos que ya
// calcula el motor de Existencia Teórica (promedio/desviación/stock de
// seguridad/inventario óptimo/reposición) más la diferencia final.
const PEDIDO_BG = '#9a3412'
const PEDIDO_GREEN_BG = '#ecfdf5'
const PEDIDO_GREEN_TEXT = '#047857'
const PEDIDO_RED_BG = '#fef2f2'
const PEDIDO_RED_TEXT = '#b91c1c'
const PEDIDO_COLS = [
  { key: 'promedioFinalPedido',     label: 'Promedio Final',      group: 'green' },
  { key: 'desviacionStdPedido',     label: 'Desv. Std.',          group: 'green' },
  { key: 'estadistico',             label: 'Estadístico',         group: 'green' },
  { key: 'stockSeguridad',          label: 'Stock Seguridad',     group: 'green' },
  { key: 'inventarioOptimo',        label: 'Inv. Óptimo',         group: 'green' },
  { key: 'reposicion',              label: 'Reposición',          group: 'green' },
  { key: 'diferenciaPedidoFabrica', label: 'Dif. Pedido Fábrica', group: 'red' },
]
const PEDIDO_COL_WIDTH = 110
function pedidoCellStyle(group, value) {
  if (value == null || value === 0) return { color: ZERO_GRAY }
  return group === 'red' ? { color: PEDIDO_RED_TEXT, fontWeight: 600 } : { color: PEDIDO_GREEN_TEXT, fontWeight: 600 }
}

function fmtNum(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 })
}
// El backend ya rellena `ceve` con el código cuando no hay nombre cargado en
// el catálogo — solo combinamos código+nombre cuando de verdad hay un nombre.
function ceveLabel(codigoCeve, ceve) {
  if (!ceve || ceve === codigoCeve) return codigoCeve
  return `${codigoCeve} - ${ceve}`
}
// "Miércoles 27-07" — nombre completo del día + fecha, parseado en hora local
// (no con `new Date(iso)`, que interpretaría la fecha en UTC y podría correr
// un día el nombre del día según la zona horaria del navegador).
function fmtDiaCompleto(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${DIAS_SEMANA[date.getDay()]} ${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`
}
// Los valores en cero o vacíos se muestran en gris muy claro para reducir el
// ruido visual — solo los valores significativos usan texto oscuro.
function numColor(v) {
  return v == null || v === 0 ? ZERO_GRAY : TEXT_MAIN
}
function diferenciaStyle(v) {
  if (v == null || v === 0) return { color: ZERO_GRAY }
  if (v > 0) return { color: TEXT_MAIN, fontWeight: 600 }
  return { color: '#dc2626', fontWeight: 700 }
}

function computeStickyLeft(orderedColumns, widths, uptoKey) {
  const keyOf = (c) => c.key ?? c.label
  const idx = orderedColumns.findIndex(c => keyOf(c) === uptoKey)
  if (idx === -1) return {}
  const offsets = {}
  let acc = 0
  for (let i = 0; i <= idx; i++) {
    const col = orderedColumns[i]
    const key = keyOf(col)
    offsets[key] = acc
    acc += widths[key] ?? col.width
  }
  return offsets
}

// Maneja orden (arrastrar encabezado) y ancho (arrastrar el borde derecho) de columnas,
// solo en memoria — se resetea al recargar la página.
function useColumnLayout(baseColumns) {
  const keyOf = (c) => c.key ?? c.label
  const [order, setOrder] = useState(() => baseColumns.map(keyOf))
  const [widths, setWidths] = useState(() => Object.fromEntries(baseColumns.map(c => [keyOf(c), c.width])))
  const [dragOverKey, setDragOverKey] = useState(null)
  const dragKeyRef = useRef(null)
  const suppressClickRef = useRef(false)

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

function HeaderCell({ col, width, active, sortDir, onSort, layout, stickyLeft, isLastSticky, headerBg, headerColor }) {
  const key = col.key ?? col.label
  const isDragOver = layout.dragOverKey === key
  const isSticky = stickyLeft != null
  const bg = isDragOver ? '#dbeafe' : (headerBg ?? HEADER_COL_BG)
  const color = headerColor ?? HEADER_TEXT
  return (
    <th
      rowSpan={2}
      draggable
      onDragStart={() => layout.handleDragStart(key)}
      onDragOver={(e) => layout.handleDragOver(key, e)}
      onDrop={() => layout.handleDrop(key)}
      onDragEnd={layout.handleDragEnd}
      onClick={() => { if (!layout.suppressClickRef.current) onSort?.(col.key) }}
      title="Arrastra para reordenar · arrastra el borde derecho para cambiar el ancho"
      style={{
        padding: '6px 10px', width, textAlign: col.align, fontWeight: 700,
        color, whiteSpace: 'nowrap', fontSize: 10, letterSpacing: 0.3, textTransform: 'uppercase',
        position: 'sticky', top: ROW0_H, left: isSticky ? stickyLeft : undefined,
        background: bg, borderBottom: '2px solid #e5e7eb',
        zIndex: isSticky ? 3 : 2, height: ROW1_H + ROW2_H, boxSizing: 'border-box', overflow: 'hidden',
        cursor: onSort && col.key ? 'pointer' : 'grab', userSelect: 'none',
        boxShadow: isLastSticky ? '2px 0 4px rgba(0,0,0,0.1)' : undefined,
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

export default function ExistenciaTeoricaTablero() {
  const [filtros, setFiltros] = useState({ ceves: [], categorias: [], fechas: [], organizaciones: [] })
  const [fechaVenta, setFechaVenta] = useState('')
  const [organizacion, setOrganizacion] = useState('')
  const [codigoCeve, setCodigoCeve] = useState('')
  const [categoria, setCategoria] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState(null)
  const [sortDir, setSortDir] = useState('desc')

  const [data, setData] = useState({ total: 0, ejecucionId: null, rows: [], totals: null })
  const [loading, setLoading] = useState(false)
  const [hoveredRow, setHoveredRow] = useState(null)
  // La tabla no se carga sola al tocar los filtros — solo al pulsar "Analizar".
  // Cambiar cualquier filtro la vuelve a ocultar hasta el próximo clic.
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  // Cada día de tránsito se colapsa/expande de forma independiente (clic en su
  // propio encabezado) — vacío significa "todos expandidos".
  const [collapsedDays, setCollapsedDays] = useState(() => new Set())
  function toggleDay(dayIdx) {
    setCollapsedDays(prev => {
      const next = new Set(prev)
      if (next.has(dayIdx)) next.delete(dayIdx); else next.add(dayIdx)
      return next
    })
  }

  useEffect(() => {
    fetch(`${API}/api/existencia-teorica/tablero-filtros`)
      .then(r => r.ok ? r.json() : {})
      .then(d => {
        setFiltros({ ceves: [], categorias: [], fechas: [], organizaciones: [], ...d })
        setFechaVenta(prev => prev || d?.fechas?.[0] || '')
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async (pageOverride) => {
    if (!fechaVenta) { setData({ total: 0, ejecucionId: null, rows: [], totals: null }); return }
    setLoading(true)
    try {
      const p = pageOverride ?? page
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE), fechaVenta })
      if (organizacion) params.set('organizacion', organizacion)
      if (codigoCeve) params.set('codigoCeve', codigoCeve)
      if (categoria)  params.set('categoria', categoria)
      if (search)     params.set('search', search)
      if (sortBy)     { params.set('sortBy', sortBy); params.set('sortDir', sortDir) }

      const r = await fetch(`${API}/api/existencia-teorica/tablero?${params}`)
      if (r.ok) setData(await r.json())
    } catch {}
    finally { setLoading(false) }
  }, [fechaVenta, organizacion, codigoCeve, categoria, search, sortBy, sortDir, page])

  // Página y orden sí recargan solos, pero solo después de haber analizado al
  // menos una vez — cambiar de página no debería exigir un nuevo clic.
  useEffect(() => {
    if (hasAnalyzed) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, sortDir])

  function handleAnalizar() {
    setPage(1)
    setHasAnalyzed(true)
    load(1)
  }

  function updateFilter(setter) {
    return (value) => { setPage(1); setHasAnalyzed(false); setter(value) }
  }
  const updateFechaVenta    = updateFilter(setFechaVenta)
  const updateOrganizacion  = updateFilter(setOrganizacion)
  const updateCodigoCeve    = updateFilter(setCodigoCeve)
  const updateCategoria     = updateFilter(setCategoria)
  const updateSearch        = updateFilter(setSearch)

  function handleLimpiar() {
    setOrganizacion(''); setCodigoCeve(''); setCategoria(''); setSearch('')
    setSortBy(null); setSortDir('desc'); setPage(1); setHasAnalyzed(false)
  }
  function handleSort(key) {
    if (!key) return
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('desc') }
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const rangeStart = data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, data.total)

  const sampleRow = data.rows.find(r => r.fechaTransito && r.fechaTransito.some(d => d))
  const diaDates = sampleRow ? sampleRow.fechaTransito : [null, null, null, null, null, null]
  const diaCols = [0, 1, 2, 3, 4, 5]
  const mainColH = ROW1_H + ROW2_H
  const transitoColCount = diaCols.reduce((sum, d) => sum + (collapsedDays.has(d) ? 1 : DIA_METRICS.length), 0)

  const columnsBase = useMemo(() => [
    { key: 'fecha', label: 'Fecha venta', width: 90, align: 'left' },
    { key: 'ceve', label: 'CeVe', width: 210, align: 'left' },
    { key: 'producto', label: 'Producto', width: 190, align: 'left' },
    { key: 'frecuencia', label: 'Frecuencia', width: 85, align: 'left', sortable: false },
    { key: 'existenciaAut', label: 'Existencia Aut', width: 100, align: 'right' },
    { key: 'existenciaMan', label: 'Existencia Man', width: 100, align: 'right' },
    { key: 'diferencia', label: 'Diferencia', width: 90, align: 'right' },
  ], [])

  const layout = useColumnLayout(columnsBase)
  const stickyLeft = useMemo(
    () => computeStickyLeft(layout.orderedColumns, layout.widths, STICKY_UPTO_KEY),
    [layout.orderedColumns, layout.widths]
  )
  const stickyColCount = Object.keys(stickyLeft).length

  function renderCell(col, row) {
    switch (col.key) {
      case 'fecha': return row.fechaVenta
      case 'ceve': {
        const label = ceveLabel(row.codigoCeve, row.ceve)
        return <span title={label} style={{ color: BLUE_PRIMARY, fontWeight: 500 }}>{label}</span>
      }
      case 'producto': return <span title={row.longName}>{row.item}{row.longName ? ` - ${row.longName}` : ''}</span>
      case 'frecuencia': return row.frecuencia || '—'
      case 'existenciaAut': return <span style={{ color: numColor(row.existenciaAut), fontWeight: 500 }}>{fmtNum(row.existenciaAut)}</span>
      case 'existenciaMan': {
        const differs = row.diferencia != null && row.diferencia !== 0
        return <span style={differs ? { color: AMBER, fontWeight: 700 } : { color: numColor(row.existenciaMan) }}>{fmtNum(row.existenciaMan)}</span>
      }
      case 'diferencia': return <span style={diferenciaStyle(row.diferencia)}>{fmtNum(row.diferencia)}</span>
      default: return null
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '20px 28px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: TEXT_MAIN }}>
          Existencia Teórica
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: MUTED_GRAY }}>
          Existencia automática (Ivy) vs. manual, y proyección de existencia teórica día a día por tránsito.
        </p>
      </div>

      {/* Filtros */}
      <div style={{
        background: '#fff', border: '1px solid var(--border)', borderRadius: 14,
        padding: '18px 22px', marginBottom: 16, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600,
            color: MUTED_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Fecha de venta *
            <select value={fechaVenta} onChange={e => updateFechaVenta(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 150, textTransform: 'none', fontWeight: 400 }}>
              {filtros.fechas.length === 0 && <option value="">Sin ejecuciones</option>}
              {filtros.fechas.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600,
            color: MUTED_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Organización
            <select value={organizacion} onChange={e => updateOrganizacion(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 140, textTransform: 'none', fontWeight: 400 }}>
              <option value="">Todas</option>
              {filtros.organizaciones.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600,
            color: MUTED_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            CeVe
            <select value={codigoCeve} onChange={e => updateCodigoCeve(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 160, textTransform: 'none', fontWeight: 400 }}>
              <option value="">Todos</option>
              {filtros.ceves.map(c => <option key={c.codigoCeve} value={c.codigoCeve}>{ceveLabel(c.codigoCeve, c.ceve)}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600,
            color: MUTED_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Categoría
            <select value={categoria} onChange={e => updateCategoria(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 160, textTransform: 'none', fontWeight: 400 }}>
              <option value="">Todas</option>
              {filtros.categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600,
            color: MUTED_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Buscar producto
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input value={search} onChange={e => updateSearch(e.target.value)} placeholder="Item o descripción…"
                style={{ padding: '7px 10px 7px 30px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, minWidth: 180, width: '100%', textTransform: 'none', fontWeight: 400 }} />
            </div>
          </label>
          <button onClick={handleAnalizar} disabled={!fechaVenta}
            style={{ padding: '8px 20px', height: 36, fontSize: 13, fontWeight: 600, borderRadius: 8,
              background: BLUE_PRIMARY, border: 'none', color: '#fff',
              cursor: fechaVenta ? 'pointer' : 'default', opacity: fechaVenta ? 1 : 0.5 }}>
            Analizar
          </button>
          <button onClick={handleLimpiar}
            style={{ padding: '8px 16px', height: 36, fontSize: 13, borderRadius: 8, background: '#fff',
              border: '1px solid var(--border)', color: '#6b7280', cursor: 'pointer' }}>
            Limpiar
          </button>
        </div>
      </div>

      {/* Tabla */}
      {!fechaVenta ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Selecciona una fecha de venta para ver los datos.
        </div>
      ) : !hasAnalyzed ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Ajusta los filtros y pulsa <strong style={{ color: MUTED_GRAY }}>Analizar</strong> para ver los datos.
        </div>
      ) : loading && data.rows.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '24px 0' }}>Cargando…</div>
      ) : data.rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Sin resultados para estos filtros.
        </div>
      ) : (
        <>
          {/* Al reordenar o cambiar de página no se oculta la tabla completa —
              solo se atenúa mientras llega la respuesta, para evitar el parpadeo
              de perder toda la vista (scroll, columnas fijas, etc.) en cada clic. */}
          <div style={{ flex: 1, overflow: 'auto', borderRadius: 12, border: '1px solid var(--border)', minHeight: 0,
            boxShadow: '0 1px 3px rgba(15,23,42,0.07), 0 1px 2px rgba(15,23,42,0.05)',
            opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s', pointerEvents: loading ? 'none' : 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup>
                {layout.orderedColumns.map(col => (
                  <col key={col.key} style={{ width: layout.widths[col.key] ?? col.width }} />
                ))}
                {diaCols.flatMap(dayIdx => (
                  collapsedDays.has(dayIdx)
                    ? [<col key={`d-col-${dayIdx}-collapsed`} style={{ width: COLLAPSED_DAY_WIDTH }} />]
                    : DIA_METRICS.map(metric => (
                        <col key={`d-col-${dayIdx}-${metric}`} style={{ width: DIA_COL_WIDTH }} />
                      ))
                ))}
                {PEDIDO_COLS.map(col => (
                  <col key={`p-col-${col.key}`} style={{ width: PEDIDO_COL_WIDTH }} />
                ))}
              </colgroup>
              <thead>
                {/* Fila 0 — rótulo estático de grupo, solo indica a qué se refiere cada
                    bloque; no es clickeable (a diferencia de los chips de día de abajo).
                    Se divide en la parte fija (Fecha/CeVe/Producto) y el resto, porque solo
                    esa parte queda inmóvil al hacer scroll horizontal. */}
                <tr style={{ background: HEADER_BG }}>
                  <th colSpan={stickyColCount} style={{
                    textAlign: 'left', background: HEADER_BG, color: '#fff',
                    fontWeight: 700, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase',
                    padding: '5px 10px', position: 'sticky', top: 0, left: 0, zIndex: 2, height: ROW0_H, boxSizing: 'border-box' }}>
                    Producto
                  </th>
                  {stickyColCount < layout.orderedColumns.length && (
                    <th colSpan={layout.orderedColumns.length - stickyColCount} style={{
                      background: HEADER_BG, padding: 0, height: ROW0_H, boxSizing: 'border-box' }} />
                  )}
                  <th colSpan={transitoColCount} style={{
                    textAlign: 'left', background: TRANSITO_BG, color: '#fff',
                    fontWeight: 700, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase',
                    padding: 0, position: 'sticky', top: 0, zIndex: 2, height: ROW0_H, boxSizing: 'border-box' }}>
                    {/* Anclado al borde visible — si centráramos en todo el colSpan, con
                        scroll horizontal el texto quedaría fuera de la pantalla. */}
                    <span style={{ position: 'sticky', left: 0, display: 'inline-block', padding: '5px 10px', whiteSpace: 'nowrap' }}>
                      Tránsito
                    </span>
                  </th>
                  <th colSpan={PEDIDO_COLS.length} style={{
                    textAlign: 'left', background: PEDIDO_BG, color: '#fff',
                    fontWeight: 700, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase',
                    padding: '5px 10px', position: 'sticky', top: 0, zIndex: 2, height: ROW0_H, boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
                    Validador de Pedido
                  </th>
                </tr>
                <tr>
                  {layout.orderedColumns.map(col => {
                    const key = col.key ?? col.label
                    const isAmber = key === 'existenciaMan'
                    return (
                      <HeaderCell key={col.key} col={col} width={layout.widths[col.key] ?? col.width}
                        active={sortBy === col.key} sortDir={sortDir}
                        onSort={col.sortable === false ? null : handleSort} layout={layout}
                        stickyLeft={stickyLeft[key]} isLastSticky={key === STICKY_UPTO_KEY}
                        headerBg={isAmber ? AMBER_LIGHT : undefined} headerColor={isAmber ? AMBER : undefined} />
                    )
                  })}
                  {diaCols.map(dayIdx => {
                    const collapsed = collapsedDays.has(dayIdx)
                    return (
                      <th key={`day-${dayIdx}`} colSpan={collapsed ? 1 : DIA_METRICS.length} rowSpan={collapsed ? 2 : 1}
                        onClick={() => toggleDay(dayIdx)}
                        title="Clic para expandir/contraer este día"
                        style={{ padding: '5px 6px', fontSize: 10.5, color: '#fff', cursor: 'pointer',
                          textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: ROW0_H,
                          background: TRANSITO_BG,
                          zIndex: 1, height: collapsed ? mainColH : ROW1_H, boxSizing: 'border-box', overflow: 'hidden', fontWeight: 700,
                          borderRight: HDR_DIVIDER_SOFT, userSelect: 'none' }}>
                        {fmtDiaCompleto(diaDates[dayIdx]) || `Día ${dayIdx + 1}`} {collapsed ? '▶' : '▼'}
                      </th>
                    )
                  })}
                  {PEDIDO_COLS.map(col => (
                    <th key={`p-h-${col.key}`} rowSpan={2} style={{ padding: '5px 6px', fontSize: 10, fontWeight: 700,
                      color: col.group === 'red' ? PEDIDO_RED_TEXT : PEDIDO_GREEN_TEXT,
                      background: col.group === 'red' ? PEDIDO_RED_BG : PEDIDO_GREEN_BG,
                      textAlign: 'right', whiteSpace: 'nowrap', position: 'sticky', top: ROW0_H,
                      zIndex: 1, height: mainColH, boxSizing: 'border-box', overflow: 'hidden',
                      borderRight: '1px solid rgba(0,0,0,0.06)' }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {diaCols.flatMap(dayIdx => {
                    if (collapsedDays.has(dayIdx)) return []
                    return DIA_METRICS.map(metric => (
                      <th key={`h-${dayIdx}-${metric}`} style={{ padding: '4px 3px', fontSize: 9.5, color: HEADER_TEXT,
                        textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: ROW0_H + ROW1_H, background: TRANSITO_METRIC_BG,
                        zIndex: 1, width: DIA_COL_WIDTH, height: ROW2_H, boxSizing: 'border-box', overflow: 'hidden', fontWeight: 700,
                        borderRight: HDR_DIVIDER_SOFT, borderBottom: '2px solid #e5e7eb' }}>
                        {metric}
                      </th>
                    ))
                  })}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => {
                  const key = `${row.codigoCeve}-${row.item}-${i}`
                  const cellStyle = { padding: '5px 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', height: 30, color: TEXT_MAIN }
                  const baseBg = i % 2 === 0 ? '#fff' : PAGE_GRAY
                  const rowBg = hoveredRow === key ? '#eef2ff' : baseBg
                  return (
                    <tr key={key}
                      onMouseEnter={() => setHoveredRow(key)}
                      onMouseLeave={() => setHoveredRow(prev => prev === key ? null : prev)}
                      style={{ borderBottom: '1px solid var(--border)', background: rowBg, transition: 'background 0.1s' }}>
                      {layout.orderedColumns.map(col => {
                        const colKey = col.key ?? col.label
                        const isSticky = stickyLeft[colKey] !== undefined
                        return (
                          <td key={col.key} style={{ ...cellStyle, textAlign: col.align,
                            ...(isSticky ? {
                              position: 'sticky', left: stickyLeft[colKey], zIndex: 1, background: rowBg,
                              boxShadow: colKey === STICKY_UPTO_KEY ? '2px 0 4px rgba(0,0,0,0.08)' : undefined,
                            } : {}) }}>
                            {renderCell(col, row)}
                          </td>
                        )
                      })}
                      {diaCols.flatMap(dayIdx => {
                        if (collapsedDays.has(dayIdx)) {
                          const v = row.existenciaTeorica?.[dayIdx]
                          return [
                            <td key={`d-${dayIdx}-collapsed`} style={{ padding: '6px 3px', textAlign: 'right', fontSize: 11.5,
                              whiteSpace: 'nowrap', overflow: 'hidden', color: numColor(v) }}>
                              {fmtNum(v)}
                            </td>
                          ]
                        }
                        return DIA_METRICS.map(metric => {
                          let v
                          if (metric === 'Pedido Fábrica') v = row.pedidoFabrica?.[dayIdx]
                          else if (metric === 'Carga Prom') v = row.cargaProm?.[dayIdx]
                          else v = row.existenciaTeorica?.[dayIdx]
                          return (
                            <td key={`d-${dayIdx}-${metric}`} style={{ padding: '6px 3px', textAlign: 'right', fontSize: 11.5,
                              whiteSpace: 'nowrap', overflow: 'hidden', color: numColor(v) }}>
                              {fmtNum(v)}
                            </td>
                          )
                        })
                      })}
                      {PEDIDO_COLS.map(col => (
                        <td key={`p-${col.key}`} style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12,
                          whiteSpace: 'nowrap', overflow: 'hidden', ...pedidoCellStyle(col.group, row[col.key]) }}>
                          {fmtNum(row[col.key])}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
              {/* Fila de totales — fija al fondo de la tabla (sticky bottom), calculada
                  sobre TODO el conjunto filtrado (no solo la página visible) */}
              <tfoot>
                <tr style={{ background: TOTAL_BG }}>
                  {layout.orderedColumns.map((col, idx) => {
                    const key = col.key ?? col.label
                    const isSticky = stickyLeft[key] !== undefined
                    let content = ''
                    if (idx === 0) content = `TOTAL (${data.total.toLocaleString()} filas)`
                    else if (key === 'existenciaMan') content = fmtNum(data.totals?.existenciaMan)
                    else if (key === 'existenciaAut') content = fmtNum(data.totals?.existenciaAut)
                    else if (key === 'diferencia') content = fmtNum(data.totals?.diferencia)
                    return (
                      <td key={col.key} style={{ padding: '7px 10px', textAlign: col.align, fontWeight: 600,
                        color: '#fff', fontSize: 12, whiteSpace: 'nowrap', borderTop: '2px solid #000',
                        position: 'sticky', bottom: 0, left: isSticky ? stickyLeft[key] : undefined,
                        background: TOTAL_BG, zIndex: isSticky ? 2 : 1,
                        boxShadow: key === STICKY_UPTO_KEY ? '2px 0 4px rgba(0,0,0,0.3)' : undefined }}>{content}</td>
                    )
                  })}
                  {diaCols.flatMap(dayIdx => {
                    if (collapsedDays.has(dayIdx)) {
                      const v = data.totals?.existenciaTeorica?.[dayIdx]
                      return [
                        <td key={`tot-${dayIdx}-collapsed`} style={{ padding: '7px 3px', textAlign: 'right', fontSize: 11.5,
                          fontWeight: 600, color: '#fff', background: TOTAL_BG, borderTop: '2px solid #000',
                          position: 'sticky', bottom: 0 }}>
                          {fmtNum(v)}
                        </td>
                      ]
                    }
                    return DIA_METRICS.map(metric => {
                      let v
                      if (metric === 'Pedido Fábrica') v = data.totals?.pedidoFabrica?.[dayIdx]
                      else if (metric === 'Carga Prom') v = data.totals?.cargaProm?.[dayIdx]
                      else v = data.totals?.existenciaTeorica?.[dayIdx]
                      return (
                        <td key={`tot-${dayIdx}-${metric}`} style={{ padding: '7px 3px', textAlign: 'right', fontSize: 11.5,
                          fontWeight: 600, color: '#fff', background: TOTAL_BG, borderTop: '2px solid #000',
                          position: 'sticky', bottom: 0 }}>
                          {fmtNum(v)}
                        </td>
                      )
                    })
                  })}
                  {PEDIDO_COLS.map(col => (
                    <td key={`tot-p-${col.key}`} style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12,
                      fontWeight: 600, color: '#fff', background: TOTAL_BG, borderTop: '2px solid #000',
                      position: 'sticky', bottom: 0 }}>
                      {fmtNum(data.totals?.[col.key])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Paginación */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: 12, color: MUTED_GRAY, flexShrink: 0 }}>
            <div>Mostrando {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} de {data.total.toLocaleString()} filas · Página {page} de {totalPages}</div>
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
