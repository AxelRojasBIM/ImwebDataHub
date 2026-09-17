import { useState, useCallback, useEffect } from 'react'
import { Search, ChevronRight } from 'lucide-react'
import { API } from '../App'

const PAGE_SIZE = 50
const MUTED_GRAY = '#6B7280'
const TEXT_MAIN = '#374151'
const BLUE_PRIMARY = '#1a56db'
const GOOD = '#15803D', GOOD_BG = '#DCFCE7'
const WARN = '#B45309', WARN_BG = '#FEF3C7'
const BAD = '#B91C1C', BAD_BG = '#FEE2E2'

// Colores por grupo — mismos acentos usados en el mockup "Cascada FR" aprobado,
// para que la página real se vea consistente con el diseño ya validado.
const GROUP_STYLE = {
  produccion: { color: '#5B3FD6', weak: '#EDE9FE' },
  distprim:   { color: '#2554D6', weak: '#DBE6FE' },
  primsec:    { color: '#0E7C8C', weak: '#DFF3F5' },
  seccom:     { color: '#B45309', weak: '#FEF0DA' },
  comcon:     { color: '#0D8F63', weak: '#DDF5E9' },
}

// Cada grupo declara sus columnas y de dónde salen dentro del objeto que
// devuelve el backend: item (fila resumen, un valor por Item) o ceve (fila
// de detalle, un valor por CeVe). Cuando una fuente no tiene esa granularidad
// por diseño del proceso (ver notas del backend), el path para `ceve` es null
// y la celda queda en blanco en las filas de detalle — igual que el mockup
// original mostraba "unos sí, otros no".
const GROUPS = [
  {
    key: 'produccion', label: 'Producción',
    cols: [
      { k: 'planta', l: 'Planta', txt: true, item: r => r.produccion?.planta, ceve: null },
      { k: 'make', l: 'Make', item: r => r.produccion?.make, ceve: null },
    ],
  },
  {
    key: 'distprim', label: 'Dist. Primaria',
    cols: [{ k: 'packed', l: 'Packed', item: r => r.distPrimaria?.packed, ceve: r => r.distPrimaria?.packed }],
  },
  {
    key: 'primsec', label: 'Primaria-Secundaria',
    cols: [
      { k: 'pedido', l: 'Pedido', item: r => r.primariaSecundaria?.pedido, ceve: r => r.primariaSecundaria?.pedido },
      { k: 'embarque', l: 'Embarque', item: r => r.primariaSecundaria?.embarque, ceve: r => r.primariaSecundaria?.embarque },
      { k: 'recorte', l: 'Recorte', item: r => r.primariaSecundaria?.recorte, ceve: r => r.primariaSecundaria?.recorte },
      { k: 'aumento', l: 'Aumento', item: r => r.primariaSecundaria?.aumento, ceve: r => r.primariaSecundaria?.aumento },
      { k: 'embSinAum', l: 'Embarque s/Aum.', item: r => r.primariaSecundaria?.embarqueSinAumentos, ceve: r => r.primariaSecundaria?.embarqueSinAumentos },
      { k: 'fr', l: 'FR', fr: true, item: r => r.primariaSecundaria?.fr, ceve: r => r.primariaSecundaria?.fr },
    ],
  },
  {
    key: 'seccom', label: 'Secundaria-Comercial',
    cols: [
      { k: 'descarga', l: 'Descarga', item: r => r.secundariaComercial?.descarga, ceve: r => r.secundariaComercial?.descarga },
      { k: 'devolucion', l: 'Devolución', item: r => r.secundariaComercial?.devolucion, ceve: r => r.secundariaComercial?.devolucion },
      { k: 'existCamion', l: 'Existencia Camión', item: r => r.secundariaComercial?.existenciaCamion, ceve: r => r.secundariaComercial?.existenciaCamion },
      { k: 'pedidoSinInc', l: 'Pedido s/Incid.', item: r => r.secundariaComercial?.pedidoSinIncidencias, ceve: r => r.secundariaComercial?.pedidoSinIncidencias },
      { k: 'cargoSinAum', l: 'Cargo s/Aum.', item: r => r.secundariaComercial?.cargoSinAumento, ceve: r => r.secundariaComercial?.cargoSinAumento },
      { k: 'cargo', l: 'Cargo', item: r => r.secundariaComercial?.cargo, ceve: r => r.secundariaComercial?.cargo },
      { k: 'recorte', l: 'Recorte', item: r => r.secundariaComercial?.recorte, ceve: r => r.secundariaComercial?.recorte },
      { k: 'fr', l: 'FR', fr: true, item: r => r.secundariaComercial?.fr, ceve: r => r.secundariaComercial?.fr },
      { k: 'invCeve', l: 'Inv. CeVe', item: r => r.secundariaComercial?.inventarioCeve, ceve: r => r.secundariaComercial?.inventarioCeve },
      { k: 'metaPzs', l: 'Meta Pzs', item: r => r.secundariaComercial?.metaPzs, ceve: r => r.secundariaComercial?.metaPzs },
      { k: 'metaDist', l: 'Meta Dist', item: r => r.secundariaComercial?.metaDist, ceve: r => r.secundariaComercial?.metaDist },
      { k: 'planUnicoIrr', l: 'Plan Único Irrestr.', item: r => r.secundariaComercial?.planUnicoIrrestricto, ceve: r => r.secundariaComercial?.planUnicoIrrestricto },
      { k: 'planUnicoRes', l: 'Plan Único Restr.', item: r => r.secundariaComercial?.planUnicoRestricciones, ceve: r => r.secundariaComercial?.planUnicoRestricciones },
    ],
  },
  {
    key: 'comcon', label: 'Comercial-Consumidor',
    cols: [
      { k: 'venta', l: 'Venta', item: r => r.comercialConsumidor?.venta, ceve: r => r.comercialConsumidor?.venta },
      { k: 'ventaAnt', l: 'Venta Ant.', item: r => r.comercialConsumidor?.ventaAnterior, ceve: r => r.comercialConsumidor?.ventaAnterior },
      { k: 'ppto', l: 'Ppto', item: r => r.comercialConsumidor?.ppto, ceve: r => r.comercialConsumidor?.ppto },
      { k: 'alcPpto', l: 'Alc. Ppto', fr: true, item: r => r.comercialConsumidor?.alcPpto, ceve: r => r.comercialConsumidor?.alcPpto },
    ],
  },
]

function fmt(v) {
  if (v == null) return <span style={{ color: '#c7c9d9' }}>—</span>
  return Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 })
}
function frPill(v) {
  if (v == null) return <span style={{ color: '#c7c9d9' }}>—</span>
  const [color, bg] = v >= 100 ? [GOOD, GOOD_BG] : v >= 90 ? [WARN, WARN_BG] : [BAD, BAD_BG]
  return (
    <span style={{ display: 'inline-flex', fontWeight: 700, fontSize: 11.5, padding: '2px 8px', borderRadius: 999, background: bg, color, whiteSpace: 'nowrap' }}>
      {(Math.round(v * 10) / 10).toString().replace(/\.0$/, '')}%
    </span>
  )
}

function currentIsoWeek() {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return { anio: d.getUTCFullYear(), semana: Math.ceil((((d - yearStart) / 86400000) + 1) / 7) }
}

export default function CascadaFR() {
  const initWeek = currentIsoWeek()
  const [anio, setAnio] = useState(initWeek.anio)
  const [semana, setSemana] = useState(initWeek.semana)
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('')
  const [categorias, setCategorias] = useState([])
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetch(`${API}/api/cascada-fr/categorias`)
      .then(r => r.ok ? r.json() : [])
      .then(setCategorias)
      .catch(() => {})
  }, [])

  const [data, setData] = useState({ total: 0, items: [] })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
  function toggleGroup(key) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Detalle por CeVe: se pide bajo demanda al expandir un item, y se guarda en
  // caché por item para no volver a pedirlo si se colapsa y expande de nuevo.
  const [expanded, setExpanded] = useState(() => new Set())
  const [detalles, setDetalles] = useState({})
  const [detalleLoading, setDetalleLoading] = useState(() => new Set())

  async function toggleExpand(item) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(item)) next.delete(item); else next.add(item)
      return next
    })
    if (detalles[item] || detalleLoading.has(item)) return
    setDetalleLoading(prev => new Set(prev).add(item))
    try {
      const r = await fetch(`${API}/api/cascada-fr/items/${encodeURIComponent(item)}/detalle?anio=${anio}&semana=${semana}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setDetalles(prev => ({ ...prev, [item]: d }))
    } catch (e) {
      setDetalles(prev => ({ ...prev, [item]: { error: e.message, ceves: [] } }))
    } finally {
      setDetalleLoading(prev => { const n = new Set(prev); n.delete(item); return n })
    }
  }

  const load = useCallback(async (pageOverride) => {
    setLoading(true)
    setLoadError(null)
    try {
      const p = pageOverride ?? page
      const params = new URLSearchParams({ anio: String(anio), semana: String(semana), page: String(p), pageSize: String(PAGE_SIZE) })
      if (search) params.set('search', search)
      if (categoria) params.set('categoria', categoria)
      const r = await fetch(`${API}/api/cascada-fr/items?${params}`)
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.detail || d.title || `HTTP ${r.status}`)
      }
      setData(await r.json())
    } catch (e) {
      setLoadError(e.message)
      setData({ total: 0, items: [] })
    } finally { setLoading(false) }
  }, [anio, semana, search, categoria, page])

  function handleAnalizar() {
    setPage(1)
    setHasAnalyzed(true)
    setExpanded(new Set())
    setDetalles({})
    load(1)
  }
  function handleLimpiar() {
    const w = currentIsoWeek()
    setAnio(w.anio); setSemana(w.semana); setSearch(''); setCategoria('')
    setPage(1); setHasAnalyzed(false)
    setExpanded(new Set()); setDetalles({})
  }
  function goPage(p) {
    setPage(p)
    load(p)
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const rangeStart = data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, data.total)

  const visibleGroups = GROUPS.map(g => ({ ...g, collapsed: collapsedGroups.has(g.key) }))

  function RowCells({ row, mode }) {
    // mode: 'item' (fila resumen) o 'ceve' (fila de detalle)
    return visibleGroups.map(g => {
      if (g.collapsed) {
        const frCol = g.cols.find(c => c.fr)
        const getter = frCol?.[mode]
        const v = getter ? getter(row) : null
        return (
          <td key={g.key} style={{ padding: '7px 10px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
            {frCol ? frPill(v) : <span style={{ color: '#c7c9d9' }}>—</span>}
          </td>
        )
      }
      return g.cols.map(c => {
        const getter = c[mode]
        const v = getter ? getter(row) : undefined
        return (
          <td key={g.key + c.k} style={{ padding: '7px 10px', textAlign: c.txt ? 'left' : 'right', whiteSpace: 'nowrap', borderRight: '1px solid var(--border)', color: MUTED_GRAY, fontVariantNumeric: 'tabular-nums' }}>
            {getter === null || getter === undefined || v == null ? <span style={{ color: '#c7c9d9' }}>—</span> : (c.fr ? frPill(v) : c.txt ? v : fmt(v))}
          </td>
        )
      })
    })
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '20px 28px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: TEXT_MAIN }}>Cascada FR</h1>
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 22px', marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600, color: MUTED_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Año
            <input type="number" value={anio} onChange={e => { setAnio(Number(e.target.value)); setHasAnalyzed(false) }}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 90, textTransform: 'none', fontWeight: 400 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600, color: MUTED_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Semana
            <input type="number" min={1} max={53} value={semana} onChange={e => { setSemana(Number(e.target.value)); setHasAnalyzed(false) }}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 80, textTransform: 'none', fontWeight: 400 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600, color: MUTED_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Buscar item
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input value={search} onChange={e => { setSearch(e.target.value); setHasAnalyzed(false) }} placeholder="Item o descripción…"
                style={{ padding: '7px 10px 7px 30px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, minWidth: 200, textTransform: 'none', fontWeight: 400 }} />
            </div>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600, color: MUTED_GRAY, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Categoría
            <select value={categoria} onChange={e => { setCategoria(e.target.value); setHasAnalyzed(false) }}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 160, textTransform: 'none', fontWeight: 400 }}>
              <option value="">Todas</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button onClick={handleAnalizar} disabled={!anio || !semana}
            style={{ padding: '8px 20px', height: 36, fontSize: 13, fontWeight: 600, borderRadius: 8, background: BLUE_PRIMARY, border: 'none', color: '#fff',
              cursor: (anio && semana) ? 'pointer' : 'default', opacity: (anio && semana) ? 1 : 0.5 }}>
            Analizar
          </button>
          <button onClick={handleLimpiar}
            style={{ padding: '8px 16px', height: 36, fontSize: 13, borderRadius: 8, background: '#fff', border: '1px solid var(--border)', color: '#6b7280', cursor: 'pointer' }}>
            Limpiar
          </button>
        </div>
      </div>

      {/* Tabla */}
      {!hasAnalyzed ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14, border: '1px dashed var(--border)', borderRadius: 12 }}>
          Ajusta año y semana y pulsa <strong style={{ color: MUTED_GRAY }}>Analizar</strong> para ver los datos.
        </div>
      ) : loading && data.items.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '24px 0' }}>Cargando…</div>
      ) : loadError ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#991b1b', fontSize: 13, border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 12 }}>
          No se pudo cargar la información: {loadError}
          <div style={{ marginTop: 10 }}>
            <button onClick={() => load()} className="btn">↻ Reintentar</button>
          </div>
        </div>
      ) : data.items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 12 }}>
          Sin resultados para estos filtros.
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflow: 'auto', borderRadius: 12, border: '1px solid var(--border)', minHeight: 0,
            boxShadow: '0 1px 3px rgba(15,23,42,0.07), 0 1px 2px rgba(15,23,42,0.05)',
            opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s', pointerEvents: loading ? 'none' : 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5, whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, background: 'var(--surface-2, #f6f6fb)', minWidth: 300 }} colSpan={2} />
                  {visibleGroups.map(g => (
                    <th key={g.key}
                      colSpan={g.collapsed ? 1 : g.cols.length}
                      onClick={() => toggleGroup(g.key)}
                      title="Clic para expandir/contraer este grupo"
                      style={{
                        position: 'sticky', top: 0, zIndex: 2, cursor: 'pointer', userSelect: 'none',
                        padding: '9px 10px', fontFamily: 'monospace', fontSize: 11.5, fontWeight: 700,
                        background: GROUP_STYLE[g.key].weak, color: GROUP_STYLE[g.key].color,
                        borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                      }}>
                      {g.label} <span style={{ fontSize: 9, opacity: 0.75 }}>{g.collapsed ? '▸' : '▾'}</span>
                    </th>
                  ))}
                </tr>
                <tr>
                  {['Item - Descripción', 'Categoría'].map((h, i) => (
                    <th key={h} style={{
                      position: 'sticky', top: 33, left: [0, 340][i], zIndex: 3,
                      background: '#f6f6fb', padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700,
                      fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'left',
                      borderRight: i === 1 ? '2px solid var(--border-strong, #d3d3e3)' : '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      boxShadow: i === 1 ? '2px 0 4px rgba(0,0,0,0.06)' : undefined,
                    }}>
                      {h}
                    </th>
                  ))}
                  {visibleGroups.flatMap(g => g.collapsed
                    ? [<th key={g.key + '-fr'} style={{ position: 'sticky', top: 33, zIndex: 1, background: GROUP_STYLE[g.key].weak, opacity: 0.85, padding: '6px 10px', fontSize: 10.5, textAlign: 'center', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>FR</th>]
                    : g.cols.map(c => (
                      <th key={g.key + c.k} style={{ position: 'sticky', top: 33, zIndex: 1, background: GROUP_STYLE[g.key].weak, opacity: 0.85, padding: '6px 10px', fontSize: 10.5, textAlign: 'right', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                        {c.l}
                      </th>
                    )))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row, i) => {
                  const isExpanded = expanded.has(row.item)
                  const detalle = detalles[row.item]
                  const isLoadingDetalle = detalleLoading.has(row.item)
                  const baseBg = i % 2 === 0 ? '#fff' : '#f6f6fb'
                  return (
                    <>
                      <tr key={row.item} style={{ background: baseBg, borderTop: i > 0 ? '2px solid var(--border-strong, #d3d3e3)' : undefined }}>
                        <td style={{
                          position: 'sticky', left: 0, zIndex: 1, background: baseBg, padding: '7px 10px',
                          borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontWeight: 600,
                          maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis',
                        }} title={row.descripcion}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => toggleExpand(row.item)}>
                            <ChevronRight size={13} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: MUTED_GRAY, flexShrink: 0 }} />
                            {row.item}{row.descripcion ? ` - ${row.descripcion}` : ''}
                          </span>
                        </td>
                        <td style={{ position: 'sticky', left: 340, zIndex: 1, background: baseBg, padding: '7px 10px', borderRight: '2px solid var(--border-strong, #d3d3e3)', borderBottom: '1px solid var(--border)', boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }}>
                          {row.categoria || '—'}
                        </td>
                        <RowCells row={row} mode="item" />
                      </tr>
                      {isExpanded && (
                        isLoadingDetalle ? (
                          <tr key={row.item + '-loading'}>
                            <td colSpan={2 + visibleGroups.reduce((n, g) => n + (g.collapsed ? 1 : g.cols.length), 0)}
                              style={{ padding: '10px 16px', color: MUTED_GRAY, fontSize: 12, background: '#fafafe', borderBottom: '1px solid var(--border)' }}>
                              Cargando desglose por CeVe…
                            </td>
                          </tr>
                        ) : detalle?.error ? (
                          <tr key={row.item + '-error'}>
                            <td colSpan={2 + visibleGroups.reduce((n, g) => n + (g.collapsed ? 1 : g.cols.length), 0)}
                              style={{ padding: '10px 16px', color: BAD, fontSize: 12, background: '#fef2f2', borderBottom: '1px solid var(--border)' }}>
                              No se pudo cargar el desglose: {detalle.error}
                            </td>
                          </tr>
                        ) : detalle?.ceves?.length === 0 ? (
                          <tr key={row.item + '-empty'}>
                            <td colSpan={2 + visibleGroups.reduce((n, g) => n + (g.collapsed ? 1 : g.cols.length), 0)}
                              style={{ padding: '10px 16px', color: '#9ca3af', fontSize: 12, background: '#fafafe', borderBottom: '1px solid var(--border)' }}>
                              Sin desglose por CeVe para este item en esta semana.
                            </td>
                          </tr>
                        ) : detalle?.ceves?.map(ceveRow => (
                          <tr key={row.item + '-' + ceveRow.codCeve} style={{ background: '#fafafe' }}>
                            <td style={{ position: 'sticky', left: 0, zIndex: 1, background: '#fafafe', padding: '6px 10px 6px 28px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', color: MUTED_GRAY, fontSize: 12 }}>
                              {ceveRow.codCeve}{ceveRow.nombreCeve ? ` - ${ceveRow.nombreCeve}` : ''}
                            </td>
                            <td style={{ position: 'sticky', left: 340, zIndex: 1, background: '#fafafe', borderRight: '2px solid var(--border-strong, #d3d3e3)', borderBottom: '1px solid var(--border)', boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }} />
                            <RowCells row={ceveRow} mode="ceve" />
                          </tr>
                        ))
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: 12, color: MUTED_GRAY, flexShrink: 0 }}>
            <div>Mostrando {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} de {data.total.toLocaleString()} items · Página {page} de {totalPages}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => goPage(Math.max(1, page - 1))} disabled={page <= 1}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>
                ← Anterior
              </button>
              <button onClick={() => goPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}>
                Siguiente →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
