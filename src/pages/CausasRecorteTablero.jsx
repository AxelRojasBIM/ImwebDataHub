import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { API } from '../App'

// Input de fecha con estilo propio — el <input type="date"> nativo se deja
// transparente y sin su ícono feo (::-webkit-calendar-picker-indicator
// estirado a full-size e invisible) y se dibuja un ícono/placeholder propios
// encima, para que abra el mismo calendario del sistema pero se vea acorde
// al resto de la UI en vez del widget crudo del navegador.
function DateField({ value, onChange, max, min }) {
  return (
    <div style={{ position: 'relative', width: 118 }}>
      <input type="date" value={value} max={max} min={min} onChange={onChange}
        style={{
          padding: '5px 8px 5px 26px', borderRadius: 7, border: '1px solid var(--border)',
          fontSize: 11.5, background: '#fff', textTransform: 'none', fontWeight: 400,
          color: value ? 'var(--text)' : '#9ca3af', width: '100%', outline: 'none', boxSizing: 'border-box',
        }} />
      {/* Va DESPUES del input en el DOM para pintarse encima sin depender de
          z-index — el input nativo type=date puede tener su propio orden de
          pintado que ignoraba el z-index del icono cuando iba antes. */}
      <Calendar size={12} style={{
        position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
        color: '#9ca3af', pointerEvents: 'none',
      }} />
    </div>
  )
}


const CAUSA_STYLES = {
  'Recorte Fabrica':                  { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  'Consumo arriba del promedio':      { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  'Existencia CeVe':                  { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
  'Sin causa identificada':           { bg: '#f3f4f6', border: '#e5e7eb', text: '#4b5563' },
  'Sin Pedido CeVe Ult Semana':       { bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490' },
}
const CAUSA_OPTS = Object.keys(CAUSA_STYLES)

// Solo para mostrar — el valor real que se filtra/guarda en BD sigue siendo
// 'Consumo arriba del promedio' (no requiere re-ejecutar históricos).
const CAUSA_LABELS = {
  'Consumo arriba del promedio': 'Consumo de Inventario',
}
const causaLabel = (causa) => CAUSA_LABELS[causa] || causa

// Columnas que se quedan con su alineación/color original (texto descriptivo) —
// todo lo demás (métricas, cupo, canal, marca, filas, etc.) se centra y se pinta
// de negro plano.
const EXCLUDE_BLACK_CENTER = new Set([
  'fecha', 'ceve', 'item', 'producto', 'categoria', 'region',
  'causaPrincipal', 'causaPredominante', 'resumen',
])

const GROUP_FIELDS = [
  { key: 'fecha',     label: 'Fecha',     width: 90 },
  { key: 'ceve',      label: 'CeVe',      width: 180 },
  { key: 'item',      label: 'Item',      width: 220 },
  { key: 'categoria', label: 'Categoría', width: 130 },
  { key: 'canal',     label: 'Canal',     width: 115 },
  { key: 'marca',     label: 'Marca',     width: 130 },
]

const HEADER_H = 32
const MIN_COL_WIDTH = 50

function CausaBadge({ causa, small }) {
  if (!causa) return <span style={{ color: '#9ca3af' }}>—</span>
  const s = CAUSA_STYLES[causa] || CAUSA_STYLES['Sin causa identificada']
  return (
    <span style={{
      display: 'inline-block', padding: small ? '1px 7px' : '2px 9px', borderRadius: 99,
      fontSize: small ? 10.5 : 11.5, fontWeight: 600,
      background: s.bg, border: `1px solid ${s.border}`, color: s.text,
      whiteSpace: 'nowrap',
    }}>{causaLabel(causa)}</span>
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
// Solo para mostrar en los encabezados — el label real (usado en CSV, orden,
// etc.) se queda igual. "Recorte Total Pzs" -> "Recorte total pzs".
function sentenceCase(s) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
// Igual que el resto de la app: "código - nombre" (solo el código si no hay nombre distinto).
function ceveLabel(codigoCeve, ceve) {
  if (!ceve || ceve === codigoCeve) return codigoCeve
  return `${codigoCeve} - ${ceve}`
}
const HOY_ISO = new Date().toISOString().slice(0, 10)

const PAGE_SIZE = 100
const TITLE_H = 26
const DATE_H = 20
const METRIC_H = 22
const COLLAPSED_TITLE_WIDTH = 110
const DIA_COL_WIDTH = 52

// Columna a partir de la cual (inclusive) se inmovilizan las columnas de la
// izquierda al hacer scroll horizontal, para no perder de vista el contexto
// (Fecha/CeVe/Item/Producto) mientras se revisan las columnas de la derecha.
const STICKY_UPTO_KEY = 'producto'

// Divisores sutiles entre celdas de encabezado, para separar visualmente
// cada bloque de fecha/métrica dentro de Recorte Fábrica y Consumo Inventario.
const HDR_DIVIDER_SOFT = '1px solid rgba(255,255,255,0.28)'
const HDR_DIVIDER_STRONG = '2px solid rgba(0,0,0,0.18)'

// Colores vivos por bloque (título/fecha/métrica) para que ambos análisis
// resalten más que el resto del encabezado — tonos ejecutivos (índigo/verde
// azulado), no rojo/marrón, para no leerse como una alerta de error.
const RECORTE_COLORS = { title: '#1a56db', date: '#2563eb', metric: '#1a56db' }
const CONSUMO_COLORS = { title: '#0f766e', date: '#0d9488', metric: '#0f766e' }
const TRANSITO_COLORS = { title: '#475569', date: '#334155', metric: '#475569' }
const TOTAL_BG = '#1a2e4a'

// Detalle día por día (solo tiene sentido cuando la vista está en un solo día,
// porque ahí las fechas de tránsito son las mismas para todas las filas).
const DIA_METRICS_RECORTE = ['Pedido CeVe', 'Entregado', 'Recorte', 'Aumento']
const DIA_METRICS_CONSUMO = ['Cargo Real', 'Cargo Prom.', 'Exceso', 'Ahorro']
// Métricas "derivadas" (una diferencia) que se resaltan con color de fondo cuando son > 0,
// para que salte a la vista dónde sí hubo recorte/consumo sin tener que leer cada número.
const METRIC_HIGHLIGHT = {
  'Recorte':  { bg: '#fef2f2', color: '#991b1b' },
  'Aumento':  { bg: '#f0fdf4', color: '#166534' },
  'Exceso':   { bg: '#fffbeb', color: '#92400e' },
  'Ahorro':   { bg: '#eff6ff', color: '#1d4ed8' },
}

// Calcula, para las columnas ordenadas actuales, el offset "left" acumulado
// de cada columna desde el inicio hasta (e incluyendo) `uptoKey`. Si esa
// columna no existe en el set actual (p. ej. en la vista agrupada), no se
// inmoviliza nada — devuelve {}.
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

function recorteFabricaValue(row, dayIdx, metric) {
  const pedido = dayIdx < 6 ? row.pedidoFabrica?.[dayIdx] : row.hoyPedido
  const entregado = dayIdx < 6 ? row.embarqueReal?.[dayIdx] : row.hoyEntregado
  if (pedido == null && entregado == null) return null
  const diff = (entregado ?? 0) - (pedido ?? 0)
  if (metric === 'Pedido CeVe') return pedido
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
function metricCellStyle(metric, value) {
  const hl = METRIC_HIGHLIGHT[metric]
  if (!hl || !value || value <= 0) return { color: '#9ca3af' }
  return { background: hl.bg, color: hl.color, fontWeight: 700, borderRadius: 4 }
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

function HeaderCell({ col, width, active, sortDir, onSort, layout, rowSpan, height, stickyLeft, isLastSticky }) {
  const key = col.key ?? col.label
  const isDragOver = layout.dragOverKey === key
  const isSticky = stickyLeft != null
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
        padding: '7px 10px', width, textAlign: col.align, fontWeight: 700,
        color: '#fff', whiteSpace: 'nowrap', fontSize: 11, letterSpacing: 0.3, textTransform: 'none',
        position: 'sticky', top: 0, left: isSticky ? stickyLeft : undefined,
        background: isDragOver ? '#24374a' : TOTAL_BG,
        zIndex: isSticky ? 3 : 2, height: height ?? HEADER_H, boxSizing: 'border-box', overflow: 'hidden',
        cursor: onSort && col.key ? 'pointer' : 'grab', userSelect: 'none',
        boxShadow: isLastSticky ? '2px 0 4px rgba(0,0,0,0.15)' : undefined,
      }}>
      {sentenceCase(col.label)}
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
  const [filtros, setFiltros] = useState({ ceves: [], canales: [], categorias: [], marcas: [], regiones: [] })
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin]       = useState('')
  const [codigoCeve, setCodigoCeve]   = useState('')
  const [canal, setCanal]             = useState('')
  const [causa, setCausa]             = useState('')
  const [categoria, setCategoria]     = useState('')
  const [marca, setMarca]             = useState('')
  const [region, setRegion]           = useState('')
  const [itemInp, setItemInp]         = useState('')
  const [item, setItem]               = useState('')
  const [groupBy, setGroupBy]         = useState(['fecha', 'ceve', 'item', 'categoria'])
  const [page, setPage]               = useState(1)
  const [sortBy, setSortBy]           = useState(null)
  const [sortDir, setSortDir]         = useState('desc')

  const [data, setData]       = useState({ total: 0, totalRecortePzs: 0, totalRecorteUsd: 0, rows: [], groupBy: [] })
  const loadRequestIdRef = useRef(0)
  const [loading, setLoading] = useState(false)
  const [hoveredRow, setHoveredRow] = useState(null)
  const [exporting, setExporting] = useState(false)

  // Nace contraído — el usuario hace clic en el título para expandir cada bloque por separado.
  const [recorteExpanded, setRecorteExpanded] = useState(false)
  const [consumoExpanded, setConsumoExpanded] = useState(false)
  const [transitoExpanded, setTransitoExpanded] = useState(false)

  // Popovers "Pedido Tránsito" / "Recorte Fábrica" / "Consumo Inventario" — se
  // abren por fila, no por columna completa, para no alterar la altura fija
  // de las filas de la tabla.
  const [pedidoTransitoRow, setPedidoTransitoRow] = useState(null)
  const [recortePopoverRow, setRecortePopoverRow] = useState(null)
  const [consumoPopoverRow, setConsumoPopoverRow] = useState(null)

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
      .then(d => setFiltros({ ceves: [], canales: [], categorias: [], marcas: [], regiones: [], ...d }))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!fechasListas) { setData({ total: 0, totalRecortePzs: 0, totalRecorteUsd: 0, rows: [], groupBy: [] }); return }
    setLoading(true)
    // Captura el groupBy de ESTA llamada específica — si el usuario cambia los
    // checkboxes mientras el fetch sigue en vuelo, la respuesta se etiqueta con
    // el agrupamiento que de verdad se pidió, no con el estado más reciente de
    // los checkboxes (evita mezclar filas viejas con columnas nuevas a medio camino).
    const requestedGroupBy = groupBy
    // Si dos fetches quedan en vuelo a la vez (toggles rápidos), solo la respuesta
    // de la petición MÁS RECIENTE debe aplicarse, aunque llegue una anterior después.
    const requestId = ++loadRequestIdRef.current
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), fechaInicio, fechaFin })
      if (codigoCeve)  params.set('codigoCeve', codigoCeve)
      if (canal)       params.set('canal', canal)
      if (causa)       params.set('causa', causa)
      if (categoria)   params.set('categoria', categoria)
      if (marca)       params.set('marca', marca)
      if (region)      params.set('region', region)
      if (item)        params.set('item', item)
      if (sortBy)      { params.set('sortBy', sortBy); params.set('sortDir', sortDir) }

      const endpoint = requestedGroupBy.length > 0
        ? `${API}/api/causas-recorte/tablero-agrupado?groupBy=${requestedGroupBy.join(',')}&${params}`
        : `${API}/api/causas-recorte/tablero?${params}`

      const r = await fetch(endpoint)
      if (r.ok) {
        const body = await r.json()
        if (requestId === loadRequestIdRef.current) setData({ ...body, groupBy: requestedGroupBy })
      }
    } catch {}
    finally { if (requestId === loadRequestIdRef.current) setLoading(false) }
  }, [fechasListas, page, fechaInicio, fechaFin, codigoCeve, canal, causa, categoria, marca, region, item, groupBy, sortBy, sortDir])

  useEffect(() => { if (!topNActive) load() }, [load, topNActive])

  // Búsqueda por item con debounce — evita una petición por cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      if (itemInp !== item) { setTopNActive(false); setPage(1); setItem(itemInp) }
    }, 350)
    return () => clearTimeout(t)
  }, [itemInp])

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
  const updateMarca       = updateFilter(setMarca)
  const updateRegion      = updateFilter(setRegion)

  function handleLimpiar() {
    setFechaInicio(''); setFechaFin(''); setCodigoCeve(''); setCanal(''); setCausa(''); setCategoria(''); setMarca(''); setRegion('')
    setItemInp(''); setItem('')
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
      if (marca)        params.set('marca', marca)
      if (region)       params.set('region', region)
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
  // Deriva de data.groupBy (lo que la última respuesta realmente trae), no de los
  // checkboxes en vivo — mientras un fetch está en vuelo, groupBy (checkboxes) ya
  // pudo cambiar antes de que lleguen filas con esa forma, y renderizar columnas
  // nuevas sobre filas viejas producía celdas vacías/mezcladas (ver load()).
  const agrupado = (data.groupBy ?? []).length > 0
  const activeGroupFields = GROUP_FIELDS.filter(f => (data.groupBy ?? []).includes(f.key))
  const puedeExportar = (topNActive && !!topNData && topNData.rows.length > 0) || data.rows.length > 0

  // El detalle día por día solo tiene sentido acotado a un solo día (Desde = Hasta):
  // ahí las fechas de tránsito son las mismas para todas las filas, aunque los
  // valores (Pedido, Entregado, etc.) sigan siendo distintos por fila. Aplica
  // tanto a la vista normal como a Top N (cada una con su propio interruptor).
  const singleDay = !!fechaInicio && fechaInicio === fechaFin
  // Agrupado: el backend solo manda el desglose día por día cuando el agrupamiento
  // es exactamente CeVe+Item (ahí sí hay un único set de Fecha_Transito por fila).
  const detalleDiaCeveItem = (data.groupBy ?? []).includes('ceve') && (data.groupBy ?? []).includes('item')
  const showDetalleDia = !topNActive && singleDay && (!agrupado || detalleDiaCeveItem)
  const showDetalleDiaTopN = topNActive && singleDay
  const activeRowsForDias = topNActive ? (topNData?.rows ?? []) : data.rows
  const sampleRow = activeRowsForDias.find(r => r.fechaTransito && r.fechaTransito.some(d => d))
  const diaDates = sampleRow ? sampleRow.fechaTransito : [null, null, null, null, null, null]
  function dayLabel(idx) {
    if (idx === 6) return 'Hoy'
    return fmtDateShort(diaDates[idx]) || `Día ${idx + 1}`
  }
  // El día 6 de tránsito cae en la fecha analizada casi siempre (el tránsito
  // solo salta domingos), así que "Hoy" repite exactamente esos mismos datos.
  // Solo aporta algo nuevo cuando el día analizado es domingo (no cae en
  // ninguna de las 6 columnas de tránsito) — ahí sí se muestra aparte.
  const hoyDuplicaDia6 = !!(diaDates[5] && fechaFin
    && String(diaDates[5]).slice(0, 10) === String(fechaFin).slice(0, 10))
  const recorteDayCols = hoyDuplicaDia6 ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]
  const consumoDayCols = [0, 1, 2, 3, 4, 5]
  // Fechas futuras de Pedido Tránsito: a diferencia de recorteDayCols/consumoDayCols
  // (siempre los mismos 6-7 días para toda la tabla), cada fila puede tener sus
  // propias fechas futuras — se toma la primera fila con datos como set de columnas
  // "canónico" (en la práctica, todas las filas de una misma consulta comparten el
  // mismo calendario de fechas futuras). Cada tabla (Top N / detalle-agrupada) usa
  // sus propias filas, así que cada una calcula su propio set.
  function futuroDatesFrom(rows) {
    for (const r of rows) { if (Array.isArray(r.fechaFuturo) && r.fechaFuturo.length) return r.fechaFuturo }
    return []
  }
  const futuroDatesMain = useMemo(() => futuroDatesFrom(data.rows), [data.rows])
  const futuroDatesTopN = useMemo(() => futuroDatesFrom(topNData?.rows ?? []), [topNData])
  const futuroIdxMain = futuroDatesMain.map((_, i) => i)
  const futuroIdxTopN = futuroDatesTopN.map((_, i) => i)
  const recorteColCount = recorteExpanded ? recorteDayCols.length * DIA_METRICS_RECORTE.length : 1
  const consumoColCount = consumoExpanded ? consumoDayCols.length * DIA_METRICS_CONSUMO.length : 1
  const transitoColCountMain = transitoExpanded ? Math.max(futuroIdxMain.length, 1) : 1
  const transitoColCountTopN = transitoExpanded ? Math.max(futuroIdxTopN.length, 1) : 1
  const detalleHeaderH = TITLE_H + DATE_H + METRIC_H
  // El rowSpan de las columnas base debe coincidir EXACTO con la cantidad de filas
  // reales del thead — las filas de fecha/métrica solo se renderizan si alguna
  // sección está expandida. Un rowSpan que excede las filas reales del thead rompe
  // el cálculo de anchos de columna bajo table-layout:fixed (columnas colapsan a 0
  // y el contenido de la fila TOTAL se desborda encimándose con otras celdas).
  const anySubExpanded = recorteExpanded || consumoExpanded || transitoExpanded
  const baseHeaderRowSpan = anySubExpanded ? 3 : 1
  const baseHeaderHeight  = anySubExpanded ? detalleHeaderH : HEADER_H
  const recorteTitleRowSpan = recorteExpanded ? 1 : (anySubExpanded ? 3 : 1)
  const recorteTitleHeight  = recorteExpanded ? TITLE_H : (anySubExpanded ? detalleHeaderH : HEADER_H)
  const consumoTitleRowSpan = consumoExpanded ? 1 : (anySubExpanded ? 3 : 1)
  const consumoTitleHeight  = consumoExpanded ? TITLE_H : (anySubExpanded ? detalleHeaderH : HEADER_H)
  const transitoTitleRowSpan = transitoExpanded ? 1 : (anySubExpanded ? 3 : 1)
  const transitoTitleHeight  = transitoExpanded ? TITLE_H : (anySubExpanded ? detalleHeaderH : HEADER_H)

  const detailColumnsBase = useMemo(() => [
    { key: 'fecha', label: 'Fecha', width: 85, align: 'left' },
    { key: 'ceve', label: 'CeVe', width: 120, align: 'left' },
    { key: 'item', label: 'Item', width: 75, align: 'left' },
    { key: 'producto', label: 'Producto', width: 170, align: 'left' },
    { key: 'cupo', label: 'Cupo', width: 70, align: 'center' },
    { key: 'canal', label: 'Canal', width: 95, align: 'center' },
    { key: 'recortePzs', label: 'Recorte Total Pzs', width: 110, align: 'center' },
    { key: 'recorteEnv', label: 'Recorte Env', width: 95, align: 'center' },
    { key: 'recorteResiduo', label: 'Recorte Pzs (residuo)', width: 130, align: 'center' },
    { key: 'recorteUsd', label: 'Recorte $', width: 95, align: 'center' },
    { key: 'existenciaPzs', label: 'Existencia Total Pzs', width: 130, align: 'center' },
    { key: 'existenciaEnv', label: 'Existencia Env', width: 110, align: 'center' },
    { key: 'existenciaUsd', label: 'Existencia $', width: 120, align: 'center' },
    { key: 'causaPrincipal', label: 'Causa Principal', width: 150, align: 'left' },
    { key: 'resumen', label: 'Resumen', width: 320, align: 'left', sortable: false },
  ], [])

  const groupedColumnsBase = useMemo(() => {
    const cols = []
    for (const f of activeGroupFields) {
      cols.push({ key: f.key, label: f.label, width: f.width, align: EXCLUDE_BLACK_CENTER.has(f.key) ? 'left' : 'center' })
      // Región y Cupo no son campos agrupables propios (Región es 1:1 con CeVe,
      // Cupo es 1:1 con Item) — se insertan justo después de su campo relacionado
      // en vez de aparecer al final de la lista de columnas.
      if (f.key === 'ceve') cols.push({ key: 'region', label: 'Región', width: 110, align: 'left' })
      if (f.key === 'item') cols.push({ key: 'cupo', label: 'Cupo', width: 70, align: 'center' })
    }
    cols.push(
    { key: 'recortePzs', label: 'Recorte Total Pzs', width: 120, align: 'center' },
    { key: 'recorteEnv', label: 'Recorte Env', width: 100, align: 'center' },
    { key: 'recorteResiduo', label: 'Recorte Pzs (residuo)', width: 140, align: 'center' },
    { key: 'recorteUsd', label: 'Recorte $', width: 110, align: 'center' },
    { key: 'existenciaPzs', label: 'Existencia Total Pzs', width: 130, align: 'center' },
    { key: 'existenciaEnv', label: 'Existencia Env', width: 110, align: 'center' },
    { key: 'existenciaUsd', label: 'Existencia $', width: 120, align: 'center' },
    { key: 'causaPredominante', label: 'Causa Predominante', width: 170, align: 'left' },
    { key: 'resumen', label: 'Resumen', width: 320, align: 'left', sortable: false },
    )
    return cols
    // Depende de data.groupBy (lo que en verdad respondió el servidor), no de los
    // checkboxes en vivo — si dependiera de `groupBy`, el memo podía quedar cacheado
    // con activeGroupFields vacío (calculado en un render donde data.groupBy aún no
    // había llegado) y nunca refrescar, aunque groupBy ya no cambiara después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(data.groupBy ?? []).join(',')])

  const topNColumnsBase = useMemo(() => [
    { key: 'rank', label: '#', width: 36, align: 'center' },
    { key: 'producto', label: 'Producto', width: 220, align: 'left' },
    { key: 'cupo', label: 'Cupo', width: 70, align: 'center' },
    { key: 'itemTotalPzs', label: 'Total Producto Pzs', width: 120, align: 'center' },
    { key: 'itemTotalUsd', label: 'Total Producto $', width: 120, align: 'center' },
    { key: 'ceve', label: 'CeVe', width: 180, align: 'left' },
    { key: 'region', label: 'Región', width: 110, align: 'left' },
    { key: 'recortePzs', label: 'Recorte Total Pzs', width: 120, align: 'center' },
    { key: 'recorteEnv', label: 'Recorte Env', width: 100, align: 'center' },
    { key: 'recorteResiduo', label: 'Recorte Pzs (residuo)', width: 140, align: 'center' },
    { key: 'recorteUsd', label: 'Recorte $', width: 110, align: 'center' },
    { key: 'existenciaPzs', label: 'Existencia Total Pzs', width: 130, align: 'center' },
    { key: 'existenciaEnv', label: 'Existencia Env', width: 110, align: 'center' },
    { key: 'existenciaUsd', label: 'Existencia $', width: 120, align: 'center' },
    { key: 'causaPredominante', label: 'Causa Predominante', width: 170, align: 'left' },
    { key: 'resumen', label: 'Resumen', width: 320, align: 'left' },
  ], [])

  const detailLayout = useColumnLayout(detailColumnsBase)
  const groupedLayout = useColumnLayout(groupedColumnsBase)
  const topNLayout = useColumnLayout(topNColumnsBase)

  const layout = agrupado ? groupedLayout : detailLayout

  const stickyLeft = useMemo(
    () => computeStickyLeft(layout.orderedColumns, layout.widths, STICKY_UPTO_KEY),
    [layout.orderedColumns, layout.widths]
  )
  const topNStickyLeft = useMemo(
    () => computeStickyLeft(topNLayout.orderedColumns, topNLayout.widths, STICKY_UPTO_KEY),
    [topNLayout.orderedColumns, topNLayout.widths]
  )

  // Popover de "Pedido Tránsito" — solo tiene datos cuando el mismo desglose día a
  // día de Recorte Fábrica/Consumo Inventario está disponible (rango de un solo día
  // agrupado por CeVe+Item), porque reutiliza esos mismos campos por fila
  // (row.pedidoFabrica[]/row.fechaTransito[]) en vez de pedir algo nuevo al backend.
  // Popover genérico "resumen por día" para las celdas colapsadas de Recorte
  // Fábrica / Consumo Inventario / Pedido Tránsito — el botón ya muestra el
  // total (no hace falta expandir toda la columna) y al hacer clic despliega
  // el desglose día por día con las mismas métricas que la columna expandida.
  // labelFn recibe (row, dayIdx) — Pedido Tránsito lo necesita porque sus
  // "días" son fechas futuras propias de cada fila, no el calendario fijo
  // que usa dayLabel() para Recorte/Consumo.
  function renderDayBreakdownCell(row, rowKey, disponible, total, dayCols, metrics, metricLetters, valueFn, openRow, setOpenRow, colors, labelFn = (_row, idx) => dayLabel(idx)) {
    if (!disponible) return <span>{fmtNum(total)}</span>
    const isOpen = openRow === rowKey
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpenRow(prev => prev === rowKey ? null : rowKey) }}
          title="Clic para ver el resumen por día"
          style={{
            padding: '2px 8px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
            background: isOpen ? colors.title : colors.bg, color: isOpen ? '#fff' : colors.title,
            border: `1px solid ${colors.border}`, whiteSpace: 'nowrap',
          }}>
          {fmtNum(total)} {isOpen ? '▲' : '▼'}
        </button>
        {isOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 10,
            background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8,
            boxShadow: '0 4px 12px rgba(15,23,42,0.18)', padding: '8px 10px',
          }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '2px 8px 4px 2px', color: '#6b7280', fontWeight: 700, whiteSpace: 'nowrap' }}>Fecha</th>
                  {metrics.map((metric, idx) => (
                    <th key={metric} title={metric} style={{ textAlign: 'right', padding: '2px 6px 4px', color: colors.title, fontWeight: 700 }}>
                      {metricLetters[idx]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dayCols.length === 0 ? (
                  <tr><td colSpan={1 + metrics.length} style={{ padding: '4px 2px', color: '#9ca3af' }}>Sin datos</td></tr>
                ) : dayCols.map(dayIdx => (
                  <tr key={dayIdx} style={{ borderTop: '1px dashed #e5e7eb' }}>
                    <td style={{ padding: '3px 8px 3px 2px', color: '#374151', fontWeight: 600, whiteSpace: 'nowrap' }}>{labelFn(row, dayIdx)}</td>
                    {metrics.map(metric => (
                      <td key={metric} style={{ padding: '3px 6px', textAlign: 'right', color: '#111827', whiteSpace: 'nowrap' }}>
                        {fmtNum(valueFn(row, dayIdx, metric))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }
  function renderRecorteFabricaCell(row, rowKey, disponible) {
    return renderDayBreakdownCell(row, rowKey, disponible, row.envsPlanta, recorteDayCols, DIA_METRICS_RECORTE, ['P', 'E', 'R', 'A'],
      recorteFabricaValue, recortePopoverRow, setRecortePopoverRow, { title: RECORTE_COLORS.title, bg: '#eff4ff', border: '#c7d7fd' })
  }
  function renderConsumoInventarioCell(row, rowKey, disponible) {
    return renderDayBreakdownCell(row, rowKey, disponible, row.envsConsumo, consumoDayCols, DIA_METRICS_CONSUMO, ['CR', 'CP', 'EX', 'AH'],
      consumoValue, consumoPopoverRow, setConsumoPopoverRow, { title: CONSUMO_COLORS.title, bg: '#ecfdf5', border: '#a7f3d0' })
  }
  function renderPedidoTransitoCell(row, rowKey, disponible) {
    const futuroIdx = (row.fechaFuturo ?? []).map((_, i) => i)
    const total = (row.pedidoFuturo ?? []).reduce((acc, v) => acc + (Number(v) || 0), 0)
    return renderDayBreakdownCell(row, rowKey, disponible, total, futuroIdx, ['Pedido CeVe'], ['P'],
      (r, idx) => r.pedidoFuturo?.[idx], pedidoTransitoRow, setPedidoTransitoRow,
      { title: TRANSITO_COLORS.title, bg: '#f1f5f9', border: '#cbd5e1' },
      (r, idx) => fmtDateShort(r.fechaFuturo?.[idx]))
  }

  function renderMainCell(col, row) {
    const key = col.key
    if (agrupado && activeGroupFields.some(f => f.key === key)) {
      return <span title={row[key]}>{row[key] ?? '—'}</span>
    }
    switch (key) {
      case 'fecha': return row.fechaVenta
      case 'ceve': return <span title={row.ceve || row.codigoCeve}>{row.ceve || row.codigoCeve}</span>
      case 'region': return row.region || '—'
      case 'item': return row.item
      case 'producto': return <span title={row.descripcion}>{row.descripcion || '—'}</span>
      case 'cupo': return row.cupo ?? '—'
      case 'canal': return row.canal || '—'
      case 'recortePzs': return <span style={{ fontWeight: 600 }}>{fmtNum(row.recortePzs)}</span>
      case 'recorteEnv': return fmtNum(row.recorteEnv)
      case 'recorteResiduo': return fmtNum(row.recorteResiduo)
      case 'recorteUsd': return <span style={{ fontWeight: 600 }}>{fmtMoney(row.recorteUsd)}</span>
      case 'existenciaPzs': return fmtNum(row.existenciaPzs)
      case 'existenciaEnv': return fmtNum(row.existenciaEnv)
      case 'existenciaUsd': return fmtMoney(row.existenciaUsd)
      case 'causaPrincipal': return <CausaBadge causa={row.causaPrincipal} />
      case 'causaPredominante': return <CausaBadge causa={row.causaPredominante} />
      case 'resumen': return <span title={row.resumen} style={{ fontSize: 12.5 }}>{row.resumen || '—'}</span>
      default: return null
    }
  }

  function renderTopNCell(col, row, isNewItem, rank) {
    switch (col.key) {
      case 'rank': return isNewItem ? rank : ''
      case 'producto': return isNewItem ? <span title={row.descripcion}>{`${row.item} - ${row.descripcion || ''}`}</span> : ''
      case 'cupo': return row.cupo ?? '—'
      case 'itemTotalPzs': return isNewItem ? fmtNum(row.itemTotalPzs) : ''
      case 'itemTotalUsd': return isNewItem ? fmtMoney(row.itemTotalUsd) : ''
      case 'ceve': return <span title={`${row.codigoCeve ?? ''} - ${row.ceve ?? ''}`}>{row.codigoCeve}{row.ceve ? ` - ${row.ceve}` : ''}</span>
      case 'region': return row.region || '—'
      case 'recortePzs': return <span style={{ fontWeight: 600 }}>{fmtNum(row.recortePzs)}</span>
      case 'recorteEnv': return fmtNum(row.recorteEnv)
      case 'recorteResiduo': return fmtNum(row.recorteResiduo)
      case 'recorteUsd': return <span style={{ fontWeight: 600 }}>{fmtMoney(row.recorteUsd)}</span>
      case 'existenciaPzs': return fmtNum(row.existenciaPzs)
      case 'existenciaEnv': return fmtNum(row.existenciaEnv)
      case 'existenciaUsd': return fmtMoney(row.existenciaUsd)
      case 'causaPredominante': return <CausaBadge causa={row.causaPredominante} />
      case 'resumen': return <span title={row.resumen} style={{ fontSize: 12.5 }}>{row.resumen || '—'}</span>
      default: return null
    }
  }

  // Valor "crudo" (número o texto plano, sin JSX ni formato de moneda) de una
  // celda para exportar — misma fuente de datos que renderMainCell/renderTopNCell,
  // pero pensado para que Excel lo trate como número donde corresponda.
  function getExportValueMain(col, row) {
    const key = col.key
    if (agrupado && activeGroupFields.some(f => f.key === key)) return row[key] ?? ''
    switch (key) {
      case 'fecha': return row.fechaVenta ?? ''
      case 'ceve': return row.ceve || row.codigoCeve || ''
      case 'region': return row.region ?? ''
      case 'item': return row.item ?? ''
      case 'producto': return row.descripcion ?? ''
      case 'cupo': return row.cupo ?? ''
      case 'canal': return row.canal ?? ''
      case 'recortePzs': return row.recortePzs ?? ''
      case 'recorteEnv': return row.recorteEnv ?? ''
      case 'recorteResiduo': return row.recorteResiduo ?? ''
      case 'recorteUsd': return row.recorteUsd ?? ''
      case 'existenciaPzs': return row.existenciaPzs ?? ''
      case 'existenciaEnv': return row.existenciaEnv ?? ''
      case 'existenciaUsd': return row.existenciaUsd ?? ''
      case 'causaPrincipal': return causaLabel(row.causaPrincipal) ?? ''
      case 'causaPredominante': return causaLabel(row.causaPredominante) ?? ''
      case 'resumen': return row.resumen ?? ''
      default: return ''
    }
  }
  function getExportValueTopN(col, row) {
    switch (col.key) {
      case 'producto': return row.item ? `${row.item} - ${row.descripcion || ''}` : ''
      case 'cupo': return row.cupo ?? ''
      case 'itemTotalPzs': return row.itemTotalPzs ?? ''
      case 'itemTotalUsd': return row.itemTotalUsd ?? ''
      case 'ceve': return row.codigoCeve ? `${row.codigoCeve}${row.ceve ? ' - ' + row.ceve : ''}` : ''
      case 'region': return row.region ?? ''
      case 'recortePzs': return row.recortePzs ?? ''
      case 'recorteEnv': return row.recorteEnv ?? ''
      case 'recorteResiduo': return row.recorteResiduo ?? ''
      case 'recorteUsd': return row.recorteUsd ?? ''
      case 'existenciaPzs': return row.existenciaPzs ?? ''
      case 'existenciaEnv': return row.existenciaEnv ?? ''
      case 'existenciaUsd': return row.existenciaUsd ?? ''
      case 'causaPredominante': return causaLabel(row.causaPredominante) ?? ''
      case 'resumen': return row.resumen ?? ''
      default: return ''
    }
  }
  function csvEscape(v) {
    if (v == null) return ''
    const s = String(v)
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  function downloadCsv(filename, headerRows, dataRows) {
    const lines = [...headerRows, ...dataRows].map(r => r.map(csvEscape).join(','))
    const csv = '﻿' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Exporta exactamente la vista activa en ese momento — Top N, agrupada o de
  // detalle — incluyendo el desglose día por día completo (Recorte Fábrica /
  // Consumo Inventario) cuando el rango es de un solo día, sin importar si esos
  // bloques están colapsados en pantalla (colapsar es solo para ahorrar espacio,
  // no significa que ese detalle no exista). Para Top N ya tenemos todas las
  // filas en memoria (esa vista no pagina); para la vista normal/agrupada, en
  // cambio, `data.rows` solo trae la página visible — hay que volver a pedir
  // el conjunto completo con los mismos filtros, si no el export saldría
  // truncado a 100 filas.
  async function handleExportar() {
    setExporting(true)
    try {
      const isTopN = topNActive && !!topNData
      const detalleActivo = isTopN ? showDetalleDiaTopN : showDetalleDia
      const sourceLayout = isTopN ? topNLayout : layout
      const getValue = isTopN ? getExportValueTopN : getExportValueMain

      let sourceRows
      if (isTopN) {
        sourceRows = topNData.rows
      } else {
        const params = new URLSearchParams({ page: '1', pageSize: String(Math.max(data.total, 1)), fechaInicio, fechaFin })
        if (codigoCeve) params.set('codigoCeve', codigoCeve)
        if (canal)      params.set('canal', canal)
        if (causa)      params.set('causa', causa)
        if (categoria)  params.set('categoria', categoria)
        if (marca)      params.set('marca', marca)
        if (region)     params.set('region', region)
        if (sortBy)     { params.set('sortBy', sortBy); params.set('sortDir', sortDir) }
        // Usa el groupBy de los datos ya cargados (lo que realmente se ve en pantalla),
        // no el de los checkboxes en vivo — si el usuario los tocó después de la última
        // carga sin esperar el refresh, exportar con el live state desalinearía los
        // campos pedidos aquí de las columnas que arma `layout` (data-derived) abajo.
        const exportGroupBy = data.groupBy ?? []
        const endpoint = agrupado
          ? `${API}/api/causas-recorte/tablero-agrupado?groupBy=${exportGroupBy.join(',')}&${params}`
          : `${API}/api/causas-recorte/tablero?${params}`
        const r = await fetch(endpoint)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        sourceRows = (await r.json()).rows
      }

      const headers = sourceLayout.orderedColumns.map(c => c.label)
      if (detalleActivo && recorteExpanded) {
        recorteDayCols.forEach(dayIdx => DIA_METRICS_RECORTE.forEach(metric => {
          headers.push(`Recorte Fabrica ${dayLabel(dayIdx)} ${metric}`)
        }))
      } else {
        headers.push('Recorte Fabrica')
      }
      if (detalleActivo && consumoExpanded) {
        consumoDayCols.forEach(dayIdx => DIA_METRICS_CONSUMO.forEach(metric => {
          headers.push(`Consumo Inventario ${dayLabel(dayIdx)} ${metric}`)
        }))
      } else {
        headers.push('Consumo Inventario')
      }
      const futuroIdxExport = isTopN ? futuroIdxTopN : futuroIdxMain
      const futuroDatesExport = isTopN ? futuroDatesTopN : futuroDatesMain
      if (detalleActivo && transitoExpanded) {
        futuroIdxExport.forEach(idx => headers.push(`Pedido Tránsito ${fmtDateShort(futuroDatesExport[idx])}`))
      } else {
        headers.push('Pedido Tránsito')
      }

      let lastItem = null, rank = 0
      const rows = sourceRows.map(row => {
        if (isTopN) {
          if (row.item !== lastItem) { rank++; lastItem = row.item }
        }
        const vals = sourceLayout.orderedColumns.map(col => {
          if (isTopN && col.key === 'rank') return rank
          return getValue(col, row)
        })
        if (detalleActivo && recorteExpanded) {
          recorteDayCols.forEach(dayIdx => DIA_METRICS_RECORTE.forEach(metric => {
            vals.push(recorteFabricaValue(row, dayIdx, metric) ?? '')
          }))
        } else {
          vals.push(row.envsPlanta ?? '')
        }
        if (detalleActivo && consumoExpanded) {
          consumoDayCols.forEach(dayIdx => DIA_METRICS_CONSUMO.forEach(metric => {
            vals.push(consumoValue(row, dayIdx, metric) ?? '')
          }))
        } else {
          vals.push(row.envsConsumo ?? '')
        }
        if (detalleActivo && transitoExpanded) {
          futuroIdxExport.forEach(idx => vals.push(row.pedidoFuturo?.[idx] ?? ''))
        } else {
          vals.push('')
        }
        return vals
      })

      const suffix = isTopN ? '_topN' : agrupado ? '_agrupado' : ''
      const filename = `causas_recorte_${fechaInicio || 'sf'}_a_${fechaFin || 'sf'}${suffix}.csv`
      downloadCsv(filename, [headers], rows)
    } catch (e) {
      alert('No se pudo exportar: ' + e.message)
    } finally {
      setExporting(false)
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
        background: '#fff', border: '1px solid var(--border)', borderRadius: 14,
        padding: '12px 16px', marginBottom: 16, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Desde *
            <DateField value={fechaInicio} max={fechaFin || HOY_ISO} onChange={e => updateFechaInicio(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Hasta *
            <DateField value={fechaFin} min={fechaInicio || undefined} max={HOY_ISO} onChange={e => updateFechaFin(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Región
            <select value={region} onChange={e => updateRegion(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 11.5, background: '#fff', textTransform: 'none', fontWeight: 400, minWidth: 130 }}>
              <option value="">Todas</option>
              {filtros.regiones.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            CeVe
            <select value={codigoCeve} onChange={e => updateCodigoCeve(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 11.5, background: '#fff', textTransform: 'none', fontWeight: 400, minWidth: 180 }}>
              <option value="">Todos</option>
              {filtros.ceves.map(c => <option key={c.codigoCeve} value={c.codigoCeve}>{ceveLabel(c.codigoCeve, c.ceve)}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Canal
            <select value={canal} onChange={e => updateCanal(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 11.5, background: '#fff', textTransform: 'none', fontWeight: 400, minWidth: 120 }}>
              <option value="">Todos</option>
              {filtros.canales.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Categoría
            <select value={categoria} onChange={e => updateCategoria(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 11.5, background: '#fff', textTransform: 'none', fontWeight: 400, minWidth: 140 }}>
              <option value="">Todas</option>
              {filtros.categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Marca
            <select value={marca} onChange={e => updateMarca(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 11.5, background: '#fff', textTransform: 'none', fontWeight: 400, minWidth: 140 }}>
              <option value="">Todas</option>
              {filtros.marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Causa
            <select value={causa} onChange={e => updateCausa(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 11.5, background: '#fff', textTransform: 'none', fontWeight: 400, minWidth: 190 }}>
              <option value="">Todas</option>
              {CAUSA_OPTS.map(c => <option key={c} value={c}>{causaLabel(c)}</option>)}
            </select>
          </label>
          <button onClick={handleLimpiar}
            style={{ padding: '5px 12px', height: 28, fontSize: 11.5, borderRadius: 7, background: '#fff',
              border: '1px solid var(--border)', color: '#6b7280', cursor: 'pointer' }}>
            Limpiar
          </button>
          <button onClick={handleExportar} disabled={!puedeExportar || exporting}
            title="Exporta a CSV (se abre en Excel) exactamente la vista actual — Top N, agrupada o detalle, con el mismo desglose día por día si aplica. Trae todas las filas que cumplen los filtros, no solo la página visible."
            style={{ padding: '5px 12px', height: 28, fontSize: 11.5, fontWeight: 600, borderRadius: 7,
              background: puedeExportar ? '#ecfdf5' : '#fff', border: `1px solid ${puedeExportar ? '#6ee7b7' : 'var(--border)'}`,
              color: puedeExportar ? '#047857' : '#9ca3af', cursor: (puedeExportar && !exporting) ? 'pointer' : 'default',
              opacity: exporting ? 0.6 : 1 }}>
            {exporting ? '⏳ Exportando…' : '⬇ Exportar'}
          </button>
        </div>

        {/* Buscar por Item (izquierda) + Agrupar por (derecha, discreto) */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 220 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Buscar Item</span>
            <input
              value={itemInp}
              onChange={e => setItemInp(e.target.value)}
              placeholder="Código o descripción del producto…"
              style={{
                flex: 1, maxWidth: 300, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)',
                fontSize: 11.5, background: '#fff', textTransform: 'none', fontWeight: 400, outline: 'none',
              }}
            />
            {itemInp && (
              <button onClick={() => setItemInp('')}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                  color: '#6b7280', cursor: 'pointer', padding: '3px 9px', fontSize: 11 }}>
                Limpiar
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Agrupar por</span>
            {GROUP_FIELDS.map(f => (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>
                <input type="checkbox" checked={groupBy.includes(f.key)} onChange={() => toggleGroup(f.key)}
                  style={{ width: 13, height: 13, cursor: 'pointer' }} />
                {f.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Top N */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 16, flexShrink: 0, overflow: 'hidden' }}>
        <div onClick={() => setTopNOpen(o => !o)}
          style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: '#f9fafb' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#374151' }}>
            📊 Análisis Top N {topNActive && <span style={{ color: '#2563eb', marginLeft: 6 }}>(activo)</span>}
          </span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{topNOpen ? '▲ ocultar' : '▼ mostrar'}</span>
        </div>
        {topNOpen && (
          <div style={{ padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Categoría *
              <select value={topNCategoria} onChange={e => setTopNCategoria(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', textTransform: 'none', fontWeight: 400, minWidth: 180 }}>
                <option value="">Selecciona…</option>
                {filtros.categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Top productos
              <input type="number" min={1} max={100} value={topProductos} onChange={e => setTopProductos(Number(e.target.value) || 1)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 80 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              CeVes por producto
              <input type="number" min={1} max={50} value={topCeves} onChange={e => setTopCeves(Number(e.target.value) || 1)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 80 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Unidad
              <select value={topUnidad} onChange={e => setTopUnidad(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', textTransform: 'none', fontWeight: 400 }}>
                <option value="pzs">Piezas</option>
                <option value="usd">Pesos ($)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Orden
              <select value={topOrden} onChange={e => setTopOrden(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', textTransform: 'none', fontWeight: 400 }}>
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
        <div style={{ flex: 1, overflow: 'auto', borderRadius: 12, border: '1px solid var(--border)', minHeight: 0,
          boxShadow: '0 1px 3px rgba(15,23,42,0.07), 0 1px 2px rgba(15,23,42,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, tableLayout: 'fixed' }}>
            <colgroup>
              {topNLayout.orderedColumns.map(col => (
                <col key={col.key} style={{ width: topNLayout.widths[col.key] ?? col.width }} />
              ))}
              {showDetalleDiaTopN && recorteExpanded
                ? recorteDayCols.flatMap(dayIdx => DIA_METRICS_RECORTE.map(metric => (
                    <col key={`tn-rf-col-${dayIdx}-${metric}`} style={{ width: DIA_COL_WIDTH }} />
                  )))
                : <col key="tn-rf-col-collapsed" style={{ width: COLLAPSED_TITLE_WIDTH }} />}
              {showDetalleDiaTopN && consumoExpanded
                ? consumoDayCols.flatMap(dayIdx => DIA_METRICS_CONSUMO.map(metric => (
                    <col key={`tn-co-col-${dayIdx}-${metric}`} style={{ width: DIA_COL_WIDTH }} />
                  )))
                : <col key="tn-co-col-collapsed" style={{ width: COLLAPSED_TITLE_WIDTH }} />}
              {showDetalleDiaTopN && transitoExpanded
                ? futuroIdxTopN.map(idx => (
                    <col key={`tn-tr-col-${idx}`} style={{ width: DIA_COL_WIDTH }} />
                  ))
                : <col key="tn-tr-col-collapsed" style={{ width: COLLAPSED_TITLE_WIDTH }} />}
            </colgroup>
            <thead>
              <tr style={{ background: TOTAL_BG }}>
                {topNLayout.orderedColumns.map(col => {
                  const key = col.key ?? col.label
                  return (
                    <HeaderCell key={col.key} col={col} width={topNLayout.widths[col.key] ?? col.width} layout={topNLayout}
                      rowSpan={showDetalleDiaTopN ? baseHeaderRowSpan : 1} height={showDetalleDiaTopN ? baseHeaderHeight : HEADER_H}
                      stickyLeft={topNStickyLeft[key]} isLastSticky={key === STICKY_UPTO_KEY} />
                  )
                })}
                <th colSpan={showDetalleDiaTopN ? recorteColCount : 1} rowSpan={showDetalleDiaTopN ? recorteTitleRowSpan : 1}
                  onClick={showDetalleDiaTopN ? () => setRecorteExpanded(v => !v) : undefined}
                  title={showDetalleDiaTopN ? 'Clic para expandir/contraer' : undefined}
                  style={{ textAlign: 'center', background: RECORTE_COLORS.title, color: '#fff', cursor: showDetalleDiaTopN ? 'pointer' : 'default',
                    fontWeight: 700, fontSize: 11.5, letterSpacing: 0.5, textTransform: 'none',
                    padding: '6px 4px', position: 'sticky', top: 0, zIndex: 2,
                    height: showDetalleDiaTopN ? recorteTitleHeight : HEADER_H, boxSizing: 'border-box',
                    borderLeft: HDR_DIVIDER_STRONG, borderRight: HDR_DIVIDER_STRONG }}>
                  Recorte fabrica {showDetalleDiaTopN && (recorteExpanded ? '▲' : '▼')}
                </th>
                <th colSpan={showDetalleDiaTopN ? consumoColCount : 1} rowSpan={showDetalleDiaTopN ? consumoTitleRowSpan : 1}
                  onClick={showDetalleDiaTopN ? () => setConsumoExpanded(v => !v) : undefined}
                  title={showDetalleDiaTopN ? 'Clic para expandir/contraer' : undefined}
                  style={{ textAlign: 'center', background: CONSUMO_COLORS.title, color: '#fff', cursor: showDetalleDiaTopN ? 'pointer' : 'default',
                    fontWeight: 700, fontSize: 11.5, letterSpacing: 0.5, textTransform: 'none',
                    padding: '6px 4px', position: 'sticky', top: 0, zIndex: 2,
                    height: showDetalleDiaTopN ? consumoTitleHeight : HEADER_H, boxSizing: 'border-box' }}>
                  Consumo inventario {showDetalleDiaTopN && (consumoExpanded ? '▲' : '▼')}
                </th>
                <th colSpan={showDetalleDiaTopN ? transitoColCountTopN : 1} rowSpan={showDetalleDiaTopN ? transitoTitleRowSpan : 1}
                  onClick={showDetalleDiaTopN ? () => setTransitoExpanded(v => !v) : undefined}
                  title={showDetalleDiaTopN ? 'Clic para expandir/contraer' : undefined}
                  style={{ textAlign: 'center', background: TRANSITO_COLORS.title, color: '#fff', cursor: showDetalleDiaTopN ? 'pointer' : 'default',
                    fontWeight: 700, fontSize: 11.5, letterSpacing: 0.5, textTransform: 'none',
                    padding: '6px 4px', position: 'sticky', top: 0, zIndex: 2,
                    height: showDetalleDiaTopN ? transitoTitleHeight : HEADER_H, boxSizing: 'border-box',
                    borderLeft: HDR_DIVIDER_STRONG }}>
                  Pedido tránsito {showDetalleDiaTopN && (transitoExpanded ? '▲' : '▼')}
                </th>
              </tr>
              {showDetalleDiaTopN && (recorteExpanded || consumoExpanded || transitoExpanded) && (
                <tr style={{ background: TOTAL_BG }}>
                  {recorteExpanded && recorteDayCols.map(dayIdx => (
                    <th key={`tn-rf-date-${dayIdx}`} colSpan={DIA_METRICS_RECORTE.length} style={{ padding: '3px 4px', fontSize: 11, color: '#fff',
                      textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H, background: RECORTE_COLORS.date,
                      zIndex: 1, height: DATE_H, boxSizing: 'border-box', overflow: 'hidden', fontWeight: 600,
                      borderRight: HDR_DIVIDER_SOFT }}>
                      {dayLabel(dayIdx)}
                    </th>
                  ))}
                  {consumoExpanded && consumoDayCols.map(dayIdx => (
                    <th key={`tn-co-date-${dayIdx}`} colSpan={DIA_METRICS_CONSUMO.length} style={{ padding: '3px 4px', fontSize: 11, color: '#fff',
                      textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H, background: CONSUMO_COLORS.date,
                      zIndex: 1, height: DATE_H, boxSizing: 'border-box', overflow: 'hidden', fontWeight: 600,
                      borderRight: HDR_DIVIDER_SOFT }}>
                      {dayLabel(dayIdx)}
                    </th>
                  ))}
                  {transitoExpanded && futuroIdxTopN.map(idx => (
                    <th key={`tn-tr-date-${idx}`} style={{ padding: '3px 4px', fontSize: 11, color: '#fff',
                      textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H, background: TRANSITO_COLORS.date,
                      zIndex: 1, width: DIA_COL_WIDTH, height: DATE_H, boxSizing: 'border-box', overflow: 'hidden', fontWeight: 600,
                      borderRight: HDR_DIVIDER_SOFT }}>
                      {fmtDateShort(futuroDatesTopN[idx])}
                    </th>
                  ))}
                </tr>
              )}
              {showDetalleDiaTopN && (recorteExpanded || consumoExpanded || transitoExpanded) && (
                <tr style={{ background: TOTAL_BG }}>
                  {recorteExpanded && recorteDayCols.flatMap(dayIdx => DIA_METRICS_RECORTE.map(metric => (
                    <th key={`tn-rf-h-${dayIdx}-${metric}`} style={{ padding: '4px 3px', fontSize: 10, color: '#fff',
                      textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H + DATE_H, background: RECORTE_COLORS.metric,
                      zIndex: 1, width: DIA_COL_WIDTH, height: METRIC_H, boxSizing: 'border-box', overflow: 'hidden',
                      borderRight: HDR_DIVIDER_SOFT }}>
                      {metric}
                    </th>
                  )))}
                  {consumoExpanded && consumoDayCols.flatMap(dayIdx => DIA_METRICS_CONSUMO.map(metric => (
                    <th key={`tn-co-h-${dayIdx}-${metric}`} style={{ padding: '4px 3px', fontSize: 10, color: '#fff',
                      textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H + DATE_H, background: CONSUMO_COLORS.metric,
                      zIndex: 1, width: DIA_COL_WIDTH, height: METRIC_H, boxSizing: 'border-box', overflow: 'hidden',
                      borderRight: HDR_DIVIDER_SOFT }}>
                      {metric}
                    </th>
                  )))}
                  {transitoExpanded && futuroIdxTopN.map(idx => (
                    <th key={`tn-tr-h-${idx}`} style={{ padding: '4px 3px', fontSize: 10, color: '#fff',
                      textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H + DATE_H, background: TRANSITO_COLORS.metric,
                      zIndex: 1, width: DIA_COL_WIDTH, height: METRIC_H, boxSizing: 'border-box', overflow: 'hidden',
                      borderRight: HDR_DIVIDER_SOFT }}>
                      P
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {(() => {
                let lastItem = null, rank = 0
                return topNData.rows.map((row, i) => {
                  const isNewItem = row.item !== lastItem
                  if (isNewItem) { rank++; lastItem = row.item }
                  const cellStyle = { padding: '4px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', height: 26, fontSize: 10 }
                  const rowBg = rank % 2 === 0 ? '#fff' : '#f1f5f9'
                  const rowKey = `${row.item}-${row.codigoCeve}-${i}`
                  return (
                    <tr key={rowKey} style={{
                      borderBottom: '1px solid var(--border)',
                      borderTop: isNewItem && i > 0 ? '2px solid #c7d7fd' : undefined,
                      background: rowBg }}>
                      {topNLayout.orderedColumns.map(col => {
                        const key = col.key ?? col.label
                        const isSticky = topNStickyLeft[key] !== undefined
                        return (
                          <td key={col.key} style={{ ...cellStyle, textAlign: col.align,
                            color: (col.key === 'itemTotalPzs' || col.key === 'itemTotalUsd' || col.key === 'rank') && !isNewItem
                              ? '#d1d5db' : '#111827',
                            ...(key === 'pedidoTransito' ? { overflow: 'visible' } : {}),
                            ...(isSticky ? {
                              position: 'sticky', left: topNStickyLeft[key], zIndex: 1, background: rowBg,
                              boxShadow: key === STICKY_UPTO_KEY ? '2px 0 4px rgba(0,0,0,0.08)' : undefined,
                            } : {}) }}>
                            {renderTopNCell(col, row, isNewItem, rank)}
                          </td>
                        )
                      })}
                      {showDetalleDiaTopN && recorteExpanded ? (
                        recorteDayCols.flatMap(dayIdx => DIA_METRICS_RECORTE.map(metric => {
                          const v = recorteFabricaValue(row, dayIdx, metric)
                          return (
                            <td key={`tn-rf-${dayIdx}-${metric}`} style={{ padding: '6px 3px', textAlign: 'right', fontSize: 10,
                              whiteSpace: 'nowrap', overflow: 'hidden', ...metricCellStyle(metric, v) }}>
                              {fmtNum(v)}
                            </td>
                          )
                        }))
                      ) : (
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 10, overflow: 'visible' }}>
                          {renderRecorteFabricaCell(row, rowKey, showDetalleDiaTopN)}
                        </td>
                      )}
                      {showDetalleDiaTopN && consumoExpanded ? (
                        consumoDayCols.flatMap(dayIdx => DIA_METRICS_CONSUMO.map(metric => {
                          const v = consumoValue(row, dayIdx, metric)
                          return (
                            <td key={`tn-co-${dayIdx}-${metric}`} style={{ padding: '6px 3px', textAlign: 'right', fontSize: 10,
                              whiteSpace: 'nowrap', overflow: 'hidden', ...metricCellStyle(metric, v) }}>
                              {fmtNum(v)}
                            </td>
                          )
                        }))
                      ) : (
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 10, overflow: 'visible' }}>
                          {renderConsumoInventarioCell(row, rowKey, showDetalleDiaTopN)}
                        </td>
                      )}
                      {showDetalleDiaTopN && transitoExpanded ? (
                        futuroIdxTopN.map(idx => (
                          <td key={`tn-tr-${idx}`} style={{ padding: '6px 3px', textAlign: 'right', fontSize: 10,
                            whiteSpace: 'nowrap', overflow: 'hidden' }}>
                            {fmtNum(row.pedidoFuturo?.[idx])}
                          </td>
                        ))
                      ) : (
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 10, overflow: 'visible' }}>
                          {renderPedidoTransitoCell(row, rowKey, showDetalleDiaTopN)}
                        </td>
                      )}
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
      ) : loading && data.rows.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '24px 0' }}>Cargando…</div>
      ) : data.rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Sin resultados para estos filtros.
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflow: 'auto', borderRadius: 12, border: '1px solid var(--border)', minHeight: 0,
            boxShadow: '0 1px 3px rgba(15,23,42,0.07), 0 1px 2px rgba(15,23,42,0.05)',
            opacity: loading ? 0.55 : 1, transition: 'opacity 0.12s' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, tableLayout: 'fixed' }}>
              <colgroup>
                {layout.orderedColumns.map(col => (
                  <col key={col.key} style={{ width: layout.widths[col.key] ?? col.width }} />
                ))}
                {showDetalleDia && recorteExpanded
                  ? recorteDayCols.flatMap(dayIdx => DIA_METRICS_RECORTE.map(metric => (
                      <col key={`rf-col-${dayIdx}-${metric}`} style={{ width: DIA_COL_WIDTH }} />
                    )))
                  : <col key="rf-col-collapsed" style={{ width: COLLAPSED_TITLE_WIDTH }} />}
                {showDetalleDia && consumoExpanded
                  ? consumoDayCols.flatMap(dayIdx => DIA_METRICS_CONSUMO.map(metric => (
                      <col key={`co-col-${dayIdx}-${metric}`} style={{ width: DIA_COL_WIDTH }} />
                    )))
                  : <col key="co-col-collapsed" style={{ width: COLLAPSED_TITLE_WIDTH }} />}
                {showDetalleDia && transitoExpanded
                  ? futuroIdxMain.map(idx => (
                      <col key={`tr-col-${idx}`} style={{ width: DIA_COL_WIDTH }} />
                    ))
                  : <col key="tr-col-collapsed" style={{ width: COLLAPSED_TITLE_WIDTH }} />}
              </colgroup>
              <thead>
                <tr style={{ background: TOTAL_BG }}>
                  {layout.orderedColumns.map(col => {
                    const key = col.key ?? col.label
                    return (
                      <HeaderCell key={col.key} col={col} width={layout.widths[col.key] ?? col.width}
                        active={sortBy === col.key} sortDir={sortDir} rowSpan={showDetalleDia ? baseHeaderRowSpan : 1}
                        height={showDetalleDia ? baseHeaderHeight : HEADER_H}
                        onSort={col.sortable === false ? null : handleSort} layout={layout}
                        stickyLeft={stickyLeft[key]} isLastSticky={key === STICKY_UPTO_KEY} />
                    )
                  })}
                  <th colSpan={showDetalleDia ? recorteColCount : 1} rowSpan={showDetalleDia ? recorteTitleRowSpan : 1}
                    onClick={showDetalleDia ? () => setRecorteExpanded(v => !v) : undefined}
                    title={showDetalleDia ? 'Clic para expandir/contraer' : undefined}
                    style={{ textAlign: 'center', background: RECORTE_COLORS.title, color: '#fff', cursor: showDetalleDia ? 'pointer' : 'default',
                      fontWeight: 700, fontSize: 11.5, letterSpacing: 0.5, textTransform: 'none',
                      padding: '6px 4px', position: 'sticky', top: 0, zIndex: 2,
                      height: showDetalleDia ? recorteTitleHeight : HEADER_H, boxSizing: 'border-box',
                      borderLeft: HDR_DIVIDER_STRONG, borderRight: HDR_DIVIDER_STRONG }}>
                    Recorte fabrica {showDetalleDia && (recorteExpanded ? '▲' : '▼')}
                  </th>
                  <th colSpan={showDetalleDia ? consumoColCount : 1} rowSpan={showDetalleDia ? consumoTitleRowSpan : 1}
                    onClick={showDetalleDia ? () => setConsumoExpanded(v => !v) : undefined}
                    title={showDetalleDia ? 'Clic para expandir/contraer' : undefined}
                    style={{ textAlign: 'center', background: CONSUMO_COLORS.title, color: '#fff', cursor: showDetalleDia ? 'pointer' : 'default',
                      fontWeight: 700, fontSize: 11.5, letterSpacing: 0.5, textTransform: 'none',
                      padding: '6px 4px', position: 'sticky', top: 0, zIndex: 2,
                      height: showDetalleDia ? consumoTitleHeight : HEADER_H, boxSizing: 'border-box' }}>
                    Consumo inventario {showDetalleDia && (consumoExpanded ? '▲' : '▼')}
                  </th>
                  <th colSpan={showDetalleDia ? transitoColCountMain : 1} rowSpan={showDetalleDia ? transitoTitleRowSpan : 1}
                    onClick={showDetalleDia ? () => setTransitoExpanded(v => !v) : undefined}
                    title={showDetalleDia ? 'Clic para expandir/contraer' : undefined}
                    style={{ textAlign: 'center', background: TRANSITO_COLORS.title, color: '#fff', cursor: showDetalleDia ? 'pointer' : 'default',
                      fontWeight: 700, fontSize: 11.5, letterSpacing: 0.5, textTransform: 'none',
                      padding: '6px 4px', position: 'sticky', top: 0, zIndex: 2,
                      height: showDetalleDia ? transitoTitleHeight : HEADER_H, boxSizing: 'border-box',
                      borderLeft: HDR_DIVIDER_STRONG }}>
                    Pedido tránsito {showDetalleDia && (transitoExpanded ? '▲' : '▼')}
                  </th>
                </tr>
                {showDetalleDia && (recorteExpanded || consumoExpanded || transitoExpanded) && (
                  <tr style={{ background: TOTAL_BG }}>
                    {recorteExpanded && recorteDayCols.map(dayIdx => (
                      <th key={`rf-date-${dayIdx}`} colSpan={DIA_METRICS_RECORTE.length} style={{ padding: '3px 4px', fontSize: 11, color: '#fff',
                        textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H, background: RECORTE_COLORS.date,
                        zIndex: 1, height: DATE_H, boxSizing: 'border-box', overflow: 'hidden', fontWeight: 600,
                        borderRight: HDR_DIVIDER_SOFT }}>
                        {dayLabel(dayIdx)}
                      </th>
                    ))}
                    {consumoExpanded && consumoDayCols.map(dayIdx => (
                      <th key={`co-date-${dayIdx}`} colSpan={DIA_METRICS_CONSUMO.length} style={{ padding: '3px 4px', fontSize: 11, color: '#fff',
                        textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H, background: CONSUMO_COLORS.date,
                        zIndex: 1, height: DATE_H, boxSizing: 'border-box', overflow: 'hidden', fontWeight: 600,
                        borderRight: HDR_DIVIDER_SOFT }}>
                        {dayLabel(dayIdx)}
                      </th>
                    ))}
                    {transitoExpanded && futuroIdxMain.map(idx => (
                      <th key={`tr-date-${idx}`} style={{ padding: '3px 4px', fontSize: 11, color: '#fff',
                        textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H, background: TRANSITO_COLORS.date,
                        zIndex: 1, width: DIA_COL_WIDTH, height: DATE_H, boxSizing: 'border-box', overflow: 'hidden', fontWeight: 600,
                        borderRight: HDR_DIVIDER_SOFT }}>
                        {fmtDateShort(futuroDatesMain[idx])}
                      </th>
                    ))}
                  </tr>
                )}
                {showDetalleDia && (recorteExpanded || consumoExpanded || transitoExpanded) && (
                  <tr style={{ background: TOTAL_BG }}>
                    {recorteExpanded && recorteDayCols.flatMap(dayIdx => DIA_METRICS_RECORTE.map(metric => (
                      <th key={`rf-h-${dayIdx}-${metric}`} style={{ padding: '4px 3px', fontSize: 10, color: '#fff',
                        textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H + DATE_H, background: RECORTE_COLORS.metric,
                        zIndex: 1, width: DIA_COL_WIDTH, height: METRIC_H, boxSizing: 'border-box', overflow: 'hidden',
                        borderRight: HDR_DIVIDER_SOFT }}>
                        {metric}
                      </th>
                    )))}
                    {consumoExpanded && consumoDayCols.flatMap(dayIdx => DIA_METRICS_CONSUMO.map(metric => (
                      <th key={`co-h-${dayIdx}-${metric}`} style={{ padding: '4px 3px', fontSize: 10, color: '#fff',
                        textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H + DATE_H, background: CONSUMO_COLORS.metric,
                        zIndex: 1, width: DIA_COL_WIDTH, height: METRIC_H, boxSizing: 'border-box', overflow: 'hidden',
                        borderRight: HDR_DIVIDER_SOFT }}>
                        {metric}
                      </th>
                    )))}
                    {transitoExpanded && futuroIdxMain.map(idx => (
                      <th key={`tr-h-${idx}`} style={{ padding: '4px 3px', fontSize: 10, color: '#fff',
                        textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: TITLE_H + DATE_H, background: TRANSITO_COLORS.metric,
                        zIndex: 1, width: DIA_COL_WIDTH, height: METRIC_H, boxSizing: 'border-box', overflow: 'hidden',
                        borderRight: HDR_DIVIDER_SOFT }}>
                        P
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {data.rows.map((row, i) => {
                  const key = agrupado
                    ? activeGroupFields.map(f => row[f.key]).join('|') + '-' + i
                    : `${row.codigoCeve}-${row.item}-${row.fechaVenta}-${row.canal}-${i}`
                  const cellStyle = { padding: '4px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', height: 26, fontSize: 10 }
                  const baseBg = i % 2 === 0 ? '#fff' : '#f1f5f9'
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
                          <td key={col.key} style={{ ...cellStyle, textAlign: col.align, color: '#111827',
                            // "Pedido Tránsito" abre un popover que se saldría de la celda —
                            // overflow:hidden (heredado de cellStyle) lo recortaría.
                            ...(colKey === 'pedidoTransito' ? { overflow: 'visible' } : {}),
                            ...(isSticky ? {
                              position: 'sticky', left: stickyLeft[colKey], zIndex: 1, background: rowBg,
                              boxShadow: colKey === STICKY_UPTO_KEY ? '2px 0 4px rgba(0,0,0,0.08)' : undefined,
                            } : {}) }}>
                            {renderMainCell(col, row)}
                          </td>
                        )
                      })}
                      {showDetalleDia && recorteExpanded ? (
                        recorteDayCols.flatMap(dayIdx => DIA_METRICS_RECORTE.map(metric => {
                          const v = recorteFabricaValue(row, dayIdx, metric)
                          return (
                            <td key={`rf-${dayIdx}-${metric}`} style={{ padding: '6px 3px', textAlign: 'right', fontSize: 10,
                              whiteSpace: 'nowrap', overflow: 'hidden', ...metricCellStyle(metric, v) }}>
                              {fmtNum(v)}
                            </td>
                          )
                        }))
                      ) : (
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 10, overflow: 'visible' }}>
                          {renderRecorteFabricaCell(row, key, showDetalleDia)}
                        </td>
                      )}
                      {showDetalleDia && consumoExpanded ? (
                        consumoDayCols.flatMap(dayIdx => DIA_METRICS_CONSUMO.map(metric => {
                          const v = consumoValue(row, dayIdx, metric)
                          return (
                            <td key={`co-${dayIdx}-${metric}`} style={{ padding: '6px 3px', textAlign: 'right', fontSize: 10,
                              whiteSpace: 'nowrap', overflow: 'hidden', ...metricCellStyle(metric, v) }}>
                              {fmtNum(v)}
                            </td>
                          )
                        }))
                      ) : (
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 10, overflow: 'visible' }}>
                          {renderConsumoInventarioCell(row, key, showDetalleDia)}
                        </td>
                      )}
                      {showDetalleDia && transitoExpanded ? (
                        futuroIdxMain.map(idx => (
                          <td key={`tr-${idx}`} style={{ padding: '6px 3px', textAlign: 'right', fontSize: 10,
                            whiteSpace: 'nowrap', overflow: 'hidden' }}>
                            {fmtNum(row.pedidoFuturo?.[idx])}
                          </td>
                        ))
                      ) : (
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 10, overflow: 'visible' }}>
                          {renderPedidoTransitoCell(row, key, showDetalleDia)}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              {/* Fila de totales — fija al fondo de la tabla (sticky bottom), calculada
                  sobre TODO el conjunto filtrado (no solo la página visible), igual que
                  en Existencia Teórica. */}
              <tfoot>
                <tr style={{ background: TOTAL_BG }}>
                  {layout.orderedColumns.map((col, idx) => {
                    const key = col.key ?? col.label
                    const isSticky = stickyLeft[key] !== undefined
                    let content = ''
                    if (idx === 0) content = `TOTAL (${data.total.toLocaleString()} ${agrupado ? 'grupos' : 'filas'})`
                    else if (col.key === 'recortePzs') content = fmtNum(data.totalRecortePzs)
                    else if (col.key === 'recorteUsd') content = fmtMoney(data.totalRecorteUsd)
                    return (
                      <td key={col.key} style={{ padding: '7px 10px', textAlign: col.align, fontWeight: 600,
                        color: '#fff', fontSize: 12, whiteSpace: 'nowrap', borderTop: '2px solid #000',
                        position: 'sticky', bottom: 0, left: isSticky ? stickyLeft[key] : undefined,
                        background: TOTAL_BG, zIndex: isSticky ? 2 : 1,
                        boxShadow: key === STICKY_UPTO_KEY ? '2px 0 4px rgba(0,0,0,0.3)' : undefined }}>{content}</td>
                    )
                  })}
                  <td colSpan={showDetalleDia ? recorteColCount : 1} style={{
                    position: 'sticky', bottom: 0, background: TOTAL_BG, borderTop: '2px solid #000' }} />
                  <td colSpan={showDetalleDia ? consumoColCount : 1} style={{
                    position: 'sticky', bottom: 0, background: TOTAL_BG, borderTop: '2px solid #000' }} />
                  <td colSpan={showDetalleDia ? transitoColCountMain : 1} style={{
                    position: 'sticky', bottom: 0, background: TOTAL_BG, borderTop: '2px solid #000' }} />
                </tr>
              </tfoot>
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
