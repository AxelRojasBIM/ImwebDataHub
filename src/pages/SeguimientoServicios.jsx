import { useState, useRef, useEffect, useCallback } from 'react'
import { fetchWithRetry } from '../apiUtils'
import { useAuth } from '../AuthContext'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'

const COLS = [
  'SCCode', 'DispatchDate', 'System', 'Pedido_Vendedor_pzs', 'Cargo_pzs',
  'Rutas_Unicas', 'Productos_Unicos', 'Filas', 'Hora_Ejecucion_CDMX',
]

const TEMPLATE = `SCCode,DispatchDate,System,Pedido_Vendedor_pzs,Cargo_pzs,Rutas_Unicas,Productos_Unicos,Filas,Hora_Ejecucion_CDMX
20279,2026-08-29,ISCM,12500,12300,8,42,915,2026-08-29 15:02:53
`

function splitCSVLine(line) {
  const fields = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { fields.push(cur.trim()); cur = '' }
      else cur += ch
    }
  }
  fields.push(cur.trim())
  return fields
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (lines.length < 2) return { rows: [], error: 'El archivo está vacío.' }
  const headers = splitCSVLine(lines[0]).map(h => h.trim())
  const missing = COLS.filter(c => !headers.includes(c))
  if (missing.length) return { rows: [], error: `Columnas faltantes: ${missing.join(', ')}` }
  const rows = lines.slice(1).map(line => {
    const vals = splitCSVLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
  return { rows, error: null }
}

function downloadTemplate() {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }))
  a.download = 'template_seguimiento_servicios.csv'
  a.click()
}

// Excel en Windows exporta "CSV" en ANSI/Windows-1252 por defecto, no UTF-8 —
// forzar UTF-8 vuelve cada acento un carácter de reemplazo irrecuperable.
function decodeCsvBuffer(buffer) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (utf8.includes('�')) {
    try { return new TextDecoder('windows-1252').decode(buffer) } catch { return utf8 }
  }
  return utf8
}

function fmtDT(val) { return val ? String(val).slice(0, 16).replace('T', ' ') : '—' }
function fmtNum(v) { return v == null ? '—' : Number(v).toLocaleString('es-MX') }

// Recuadro pequeño dentro de cada tarjeta Nacional/Región -- ✓ (enviados, verde) y
// ✕ (faltantes, rojo) son botones independientes: clic en ✓ filtra la tabla a los
// que YA mandaron ese sistema en esa región, clic en ✕ a los que faltan.
function SistemaMiniPill({ label, enviados, faltantes, activeEnvio, activeFalta, onClickEnvio, onClickFalta }) {
  const active = activeEnvio || activeFalta
  return (
    <div title={label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px', borderRadius: 7, fontSize: 11.5,
        background: active ? '#eff4ff' : '#fafafa',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      }}>
      <span style={{ fontWeight: 700, color: active ? 'var(--accent)' : '#475569' }}>{label}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        <span onClick={onClickEnvio} title={`Ver los que ya enviaron ${label} en esta región`}
          style={{
            cursor: 'pointer', color: '#065f46', fontWeight: 600, padding: '0 3px', borderRadius: 4,
            background: activeEnvio ? '#bbf7d0' : 'transparent',
          }}>✓ {enviados}</span>
        <span onClick={onClickFalta} title={`Ver los que falta ${label} en esta región`}
          style={{
            cursor: 'pointer', color: faltantes > 0 ? '#991b1b' : '#9ca3af', fontWeight: 600, padding: '0 3px', borderRadius: 4,
            background: activeFalta ? '#fecaca' : 'transparent',
          }}>✕ {faltantes}</span>
      </span>
    </div>
  )
}

// Estado real del CeVe: mira solo los sistemas que tiene activos en el catálogo
// (rtmActivo/ivActivo) -- si ninguno de los activos mandó info, "Falta"; si
// mandaron todos los activos, "Enviado"; si mandó alguno pero no todos,
// "Incompleto" (ej. tiene RTM e IV activos pero solo llegó uno de los dos).
function estadoCeve(c) {
  const activos = []
  if (c.rtmActivo) activos.push(c.rtmEnviado)
  if (c.ivActivo) activos.push(c.ivEnviado)
  if (activos.length === 0) return 'na'
  const enviados = activos.filter(Boolean).length
  if (enviados === 0) return 'falta'
  if (enviados === activos.length) return 'completo'
  return 'incompleto'
}
const ESTADO_STYLES = {
  completo:   { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46', label: '✓ Enviado' },
  incompleto: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', label: '⚠ Incompleto' },
  falta:      { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', label: '✕ Falta' },
  na:         { bg: '#f3f4f6', border: '#e5e7eb', text: '#9ca3af', label: '— N/A' },
}
function EstadoBadge({ estado }) {
  const s = ESTADO_STYLES[estado]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99,
      fontSize: 11.5, fontWeight: 700, background: s.bg, border: `1px solid ${s.border}`, color: s.text,
    }}>
      {s.label}
    </span>
  )
}

// Badge por sistema (RTM/Integral Vending) -- verde con las filas cargadas cuando
// ese sistema en concreto llegó ese día, gris cuando no.
function SistemaBadge({ enviado, filas }) {
  if (!enviado) return <span style={{ color: '#9ca3af', fontSize: 12.5 }}>—</span>
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 99,
      fontSize: 11.5, fontWeight: 700, background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46',
    }}>
      ✓ {fmtNum(filas)}
    </span>
  )
}

// ── Tab: Carga ───────────────────────────────────────────────────────────────
function TabCarga({ onSaved }) {
  const { usuario } = useAuth()
  const [file, setFile]             = useState(null)
  const [rows, setRows]             = useState([])
  const [parseError, setParseError] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [saveResult, setSaveResult] = useState(null)
  const [batches, setBatches]       = useState([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const inputRef = useRef()

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true)
    try {
      const r = await fetch(`${API}/api/seguimiento-servicios/batches`)
      setBatches(r.ok ? await r.json() : [])
    } catch { setBatches([]) }
    finally { setLoadingBatches(false) }
  }, [])

  useEffect(() => { loadBatches() }, [loadBatches])

  const handleFile = (f) => {
    if (!f) return
    setSaveResult(null)
    setFile(f)
    const reader = new FileReader()
    reader.onload = e => {
      const text = decodeCsvBuffer(e.target.result)
      const { rows: parsed, error } = parseCSV(text)
      setParseError(error)
      setRows(parsed)
    }
    reader.readAsArrayBuffer(f)
  }

  const handleSave = async () => {
    if (!rows.length) return
    setSaving(true)
    setSaveResult(null)
    const batchId = crypto.randomUUID()
    const mapped = rows.map(r => ({
      SCCode:              r.SCCode,
      DispatchDate:        r.DispatchDate,
      System:              r.System,
      Pedido_Vendedor_pzs: r.Pedido_Vendedor_pzs === '' ? null : parseFloat(r.Pedido_Vendedor_pzs),
      Cargo_pzs:           r.Cargo_pzs === '' ? null : parseFloat(r.Cargo_pzs),
      Rutas_Unicas:        r.Rutas_Unicas === '' ? null : parseInt(r.Rutas_Unicas, 10),
      Productos_Unicos:    r.Productos_Unicos === '' ? null : parseInt(r.Productos_Unicos, 10),
      Filas:               r.Filas === '' ? null : parseInt(r.Filas, 10),
      Hora_Ejecucion_CDMX: r.Hora_Ejecucion_CDMX,
    }))
    const CHUNK = 5_000
    let saved = 0
    try {
      for (let i = 0; i < mapped.length; i += CHUNK) {
        const res = await fetchWithRetry(
          `${API}/api/seguimiento-servicios/sync`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId, usuario: usuario?.nombreCompleto, rows: mapped.slice(i, i + CHUNK) }) },
          { onWaking: () => setSaveResult({ ok: true, msg: '⏳ La API está despertando, reintentando en 4 segundos…' }) }
        )
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.detail || d.error || d.title || `HTTP ${res.status}`)
        }
        const d = await res.json()
        saved += d.saved ?? CHUNK
        setSaveResult({ ok: true, msg: `Guardando... ${saved.toLocaleString()} / ${rows.length.toLocaleString()} filas` })
      }
      setSaveResult({ ok: true, msg: `✓ ${saved.toLocaleString()} filas guardadas.` })
      setFile(null); setRows([])
      await loadBatches()
      onSaved?.()
    } catch (e) {
      setSaveResult({ ok: false, msg: e.message || 'No se pudo conectar con la API. Intenta de nuevo en unos segundos.' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (batchId) => {
    if (!confirm('¿Eliminar esta carga?')) return
    await fetch(`${API}/api/seguimiento-servicios/batches/${batchId}`, { method: 'DELETE' })
    setBatches(b => b.filter(x => x.batchId !== batchId))
    onSaved?.()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{COLS.length} columnas requeridas · descarga el template para ver el formato</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={downloadTemplate}>⬇ Template CSV</button>
          <button className="btn primary" onClick={() => inputRef.current.click()}>↑ Cargar CSV</button>
          <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        </div>
      </div>

      {saveResult && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 14,
          background: saveResult.ok ? '#ecfdf5' : '#fef2f2',
          color:      saveResult.ok ? '#065f46'  : '#991b1b',
          border:     `1px solid ${saveResult.ok ? '#6ee7b7' : '#fca5a5'}` }}>
          {saveResult.msg}
        </div>
      )}
      {parseError && (
        <div className="error-msg">{parseError}
          <button className="btn" style={{ marginLeft: 10 }} onClick={() => { setFile(null); setRows([]); setParseError(null) }}>Reintentar</button>
        </div>
      )}

      {/* Preview */}
      {file && !parseError && rows.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <span style={{ fontWeight: 600 }}>{file.name}</span>
              <span style={{ marginLeft: 10, fontSize: 12, color: '#6b7280' }}>{rows.length.toLocaleString()} filas</span>
            </div>
            <button className="btn" onClick={() => { setFile(null); setRows([]) }}>✕ Cancelar</button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
            <table>
              <thead><tr>{COLS.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>{COLS.map(c => <td key={c}>{r[c]}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && <div style={{ padding: '6px 12px', fontSize: 12, color: '#9ca3af', borderTop: '1px solid var(--border)' }}>Mostrando 50 de {rows.length.toLocaleString()}</div>}
          </div>
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '9px 0' }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : `☁ Guardar ${rows.length.toLocaleString()} filas en la base de datos`}
          </button>
        </div>
      )}

      {/* Drop zone */}
      {!file && !saveResult && (
        <div
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current.click()}
          style={{ border: '2px dashed #d1d5db', borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: '#f0f4ff', marginBottom: 20 }}
        >
          <div style={{ fontSize: 28, marginBottom: 8, color: '#475569' }}>◈</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e3a8a' }}>Arrastra el CSV aquí o haz clic para seleccionarlo</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 5 }}>{COLS.length} columnas requeridas · descarga el template para ver el formato</div>
        </div>
      )}

      {/* Historial */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>Historial de cargas</span>
          <span style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>{batches.length} cargas</span>
        </div>
        <button className="btn" onClick={loadBatches}>↻ Actualizar</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Batch ID</th>
              <th>Rango de fechas</th>
              <th style={{ textAlign: 'right' }}>Filas</th>
              <th>Usuario</th>
              <th>Cargado</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loadingBatches ? (
              <tr><td colSpan={6} className="loading">Cargando...</td></tr>
            ) : batches.length === 0 ? (
              <tr><td colSpan={6} className="empty">Sin cargas. Sube tu primer CSV arriba.</td></tr>
            ) : batches.map(b => (
              <tr key={b.batchId}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#4b5563' }}>{b.batchId}</td>
                <td style={{ fontSize: 12.5 }}>{b.fechaMin === b.fechaMax ? (b.fechaMin ?? '—') : `${b.fechaMin ?? '—'} a ${b.fechaMax ?? '—'}`}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNum(b.filas)}</td>
                <td style={{ fontSize: 12.5, color: '#6b7280' }}>{b.usuario || '—'}</td>
                <td style={{ fontSize: 12, color: '#6b7280' }}>{fmtDT(b.cargadoEn)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 12px', color: '#991b1b', borderColor: '#fca5a5', background: '#fef2f2', fontWeight: 600 }} onClick={() => handleDelete(b.batchId)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab: Seguimiento por CeVe ────────────────────────────────────────────────
function TabSeguimiento({ reloadKey }) {
  const [fechas, setFechas]       = useState([])
  const [fecha, setFecha]         = useState('')
  const [resumen, setResumen]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [organizacion, setOrganizacion] = useState('Bimbo') // por default filtrado a Bimbo
  const [region, setRegion]       = useState('')
  // '' | 'rtmFalta' | 'rtmEnvio' | 'ivFalta' | 'ivEnvio' -- el ✓/✕ de cada recuadro filtra por separado
  const [sistemaFiltro, setSistemaFiltro] = useState('')
  const [estadosFiltro, setEstadosFiltro] = useState([]) // subset de ['completo','incompleto','falta','na'] -- vacío = todos
  function toggleEstado(key) {
    setEstadosFiltro(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const loadFechas = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/seguimiento-servicios/fechas`)
      const d = r.ok ? await r.json() : []
      setFechas(d)
      setFecha(prev => prev && d.includes(prev) ? prev : (d[0] ?? ''))
    } catch { setFechas([]) }
  }, [])

  useEffect(() => { loadFechas() }, [loadFechas, reloadKey])

  const loadResumen = useCallback(async () => {
    setLoading(true)
    try {
      const params = fecha ? `?fecha=${fecha}` : ''
      const r = await fetch(`${API}/api/seguimiento-servicios/resumen${params}`)
      setResumen(r.ok ? await r.json() : null)
    } catch { setResumen(null) }
    finally { setLoading(false) }
  }, [fecha])

  useEffect(() => { loadResumen() }, [loadResumen, reloadKey])

  const q = search.trim().toLowerCase()
  const ceves = resumen?.ceves ?? []
  const organizaciones = [...new Set(ceves.map(c => c.organizacion).filter(Boolean))].sort()
  const regiones = [...new Set(ceves.map(c => c.region).filter(Boolean))].sort()
  function matchesSistema(c) {
    if (sistemaFiltro === 'rtmFalta') return c.rtmActivo && !c.rtmEnviado
    if (sistemaFiltro === 'rtmEnvio') return c.rtmActivo && c.rtmEnviado
    if (sistemaFiltro === 'ivFalta')  return c.ivActivo && !c.ivEnviado
    if (sistemaFiltro === 'ivEnvio')  return c.ivActivo && c.ivEnviado
    return true
  }
  const filtered = ceves.filter(c =>
    (!q || (c.codCeve || '').toLowerCase().includes(q) || (c.nombre || '').toLowerCase().includes(q)) &&
    (!organizacion || c.organizacion === organizacion) &&
    (!region || c.region === region) &&
    (estadosFiltro.length === 0 || estadosFiltro.includes(estadoCeve(c))) &&
    matchesSistema(c)
  )

  // Los totales/porcentaje reflejan el filtro activo (organización/región/sistema/
  // búsqueda), no siempre el universo completo de CeVes -- si estás viendo solo una
  // región, el resumen debe hablar de esa región.
  const totalF = filtered.length
  const enviadosF = filtered.filter(c => c.enviado).length
  const pct = totalF > 0 ? Math.round((enviadosF / totalF) * 100) : 0

  // Estadísticas por región para las tarjetas (Nacional + una por región) --
  // respetan el filtro de organización (por default Bimbo), pero no búsqueda/región/
  // sistema, para que las tarjetas den una foto estable de dónde están los huecos
  // dentro de esa organización. Un CeVe sin RTM/Integral Vending activado en el
  // catálogo no cuenta ni como enviado ni como faltante -- simplemente no aplica.
  function statsFor(regionName) {
    const subset = ceves.filter(c =>
      (!regionName || c.region === regionName) && (!organizacion || c.organizacion === organizacion))
    const rtmAplica = subset.filter(c => c.rtmActivo)
    const ivAplica = subset.filter(c => c.ivActivo)
    return {
      total: subset.length,
      rtmEnviados: rtmAplica.filter(c => c.rtmEnviado).length,
      rtmFaltantes: rtmAplica.filter(c => !c.rtmEnviado).length,
      ivEnviados: ivAplica.filter(c => c.ivEnviado).length,
      ivFaltantes: ivAplica.filter(c => !c.ivEnviado).length,
    }
  }
  function selectCard(regionName) {
    setRegion(prev => prev === regionName ? '' : regionName)
    setSistemaFiltro('')
  }
  function selectSistema(regionName, filtroKey, e) {
    e.stopPropagation()
    if (region === regionName && sistemaFiltro === filtroKey) { setSistemaFiltro(''); return }
    setRegion(regionName)
    setSistemaFiltro(filtroKey)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Fecha de despacho
          <select value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 160 }}>
            {fechas.length === 0 && <option value="">Sin cargas</option>}
            {fechas.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar CeVe o nombre..."
          style={{ flex: '0 1 260px', alignSelf: 'flex-end', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
        {/* Filtros discretos: mismo alto que el buscador, pero grises/pequeños para no competir visualmente con la fecha */}
        <select value={organizacion} onChange={e => setOrganizacion(e.target.value)}
          style={{ alignSelf: 'flex-end', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, color: organizacion ? 'var(--text)' : '#9ca3af', background: '#fafafa', outline: 'none' }}>
          <option value="">Organización — todas</option>
          {organizaciones.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={region} onChange={e => setRegion(e.target.value)}
          style={{ alignSelf: 'flex-end', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, color: region ? 'var(--text)' : '#9ca3af', background: '#fafafa', outline: 'none' }}>
          <option value="">Región — todas</option>
          {regiones.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {/* Chips de Estado -- selección múltiple (a diferencia de Organización/Región,
            que son un solo valor a la vez), clic para prender/apagar cada uno. */}
        <div style={{ display: 'flex', gap: 5, alignSelf: 'flex-end' }}>
          {Object.entries(ESTADO_STYLES).map(([key, s]) => {
            const active = estadosFiltro.includes(key)
            return (
              <span key={key} onClick={() => toggleEstado(key)} title={s.label}
                style={{
                  cursor: 'pointer', padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: active ? s.bg : '#fafafa',
                  border: `1px solid ${active ? s.border : 'var(--border)'}`,
                  color: active ? s.text : '#9ca3af',
                }}>
                {s.label}
              </span>
            )
          })}
        </div>
        <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={loadResumen}>↻ Actualizar</button>
      </div>

      {/* Tarjetas Nacional + por región -- clic en la tarjeta filtra la tabla por esa
          región; clic en el recuadro RTM/IV filtra además a los faltantes de ese
          sistema en esa región. */}
      {resumen && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${1 + regiones.length}, 1fr)`, gap: 12, marginBottom: 22 }}>
          {[null, ...regiones].map(r => {
            const s = statsFor(r)
            const isNacional = r === null
            const selected = isNacional ? region === '' && !sistemaFiltro : region === r
            return (
              <div key={r ?? '__nacional'} onClick={() => selectCard(r ?? '')}
                style={{
                  cursor: 'pointer', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '14px 16px',
                  border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  boxShadow: selected ? '0 0 0 3px rgba(26,86,219,0.12)' : 'var(--shadow-card)',
                  transition: 'border-color 0.12s, box-shadow 0.12s',
                }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: isNacional ? 'var(--accent)' : 'var(--text)' }}>
                    {isNacional ? '🌎 Nacional' : r}
                  </span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{s.total} CeVes</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SistemaMiniPill label="RTM" enviados={s.rtmEnviados} faltantes={s.rtmFaltantes}
                    activeEnvio={region === (r ?? '') && sistemaFiltro === 'rtmEnvio'}
                    activeFalta={region === (r ?? '') && sistemaFiltro === 'rtmFalta'}
                    onClickEnvio={e => selectSistema(r ?? '', 'rtmEnvio', e)}
                    onClickFalta={e => selectSistema(r ?? '', 'rtmFalta', e)} />
                  <SistemaMiniPill label="IV" enviados={s.ivEnviados} faltantes={s.ivFaltantes}
                    activeEnvio={region === (r ?? '') && sistemaFiltro === 'ivEnvio'}
                    activeFalta={region === (r ?? '') && sistemaFiltro === 'ivFalta'}
                    onClickEnvio={e => selectSistema(r ?? '', 'ivEnvio', e)}
                    onClickFalta={e => selectSistema(r ?? '', 'ivFalta', e)} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {sistemaFiltro && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12.5, color: '#475569' }}>
          Mostrando solo los que {sistemaFiltro.endsWith('Falta') ? 'falta' : 'ya enviaron'}{' '}
          <b>{sistemaFiltro.startsWith('rtm') ? 'RTM' : 'Integral Vending'}</b>{region ? ` en ${region}` : ''}
          <button className="btn" style={{ fontSize: 11.5, padding: '3px 10px' }} onClick={() => setSistemaFiltro('')}>✕ Quitar filtro</button>
        </div>
      )}

      {/* Barra de progreso */}
      {resumen && totalF > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 10, borderRadius: 99, background: '#f3f4f6', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#059669' : '#1a56db', borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>CeVe</th>
              <th>Nombre</th>
              <th>Región</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Filas cargadas</th>
              <th>RTM</th>
              <th>Integral Vending</th>
              <th>Última carga</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="loading">Cargando...</td></tr>
            ) : !fecha ? (
              <tr><td colSpan={8} className="empty">Sube un CSV para empezar a ver el seguimiento.</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="empty">Sin resultados para ese filtro.</td></tr>
            ) : filtered.map(c => {
              const estado = estadoCeve(c)
              const rowBg = estado === 'falta' ? '#fef2f2' : estado === 'incompleto' ? '#fffbeb' : undefined
              return (
                <tr key={c.codCeve} style={{ background: rowBg }}>
                  <td style={{ fontWeight: 600 }}>{c.codCeve}</td>
                  <td>{c.nombre || '—'}</td>
                  <td>{c.region || '—'}</td>
                  <td><EstadoBadge estado={estado} /></td>
                  <td style={{ textAlign: 'right', fontWeight: c.enviado ? 600 : 400, color: c.enviado ? 'var(--text)' : '#9ca3af' }}>
                    {c.enviado ? fmtNum(c.filas) : '—'}
                  </td>
                  <td><SistemaBadge enviado={c.rtmEnviado} filas={c.rtmFilas} /></td>
                  <td><SistemaBadge enviado={c.ivEnviado} filas={c.ivFilas} /></td>
                  <td style={{ fontSize: 12, color: '#6b7280' }}>{fmtDT(c.ultimaCarga)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
const TABS = [
  { key: 'seguimiento', label: 'Seguimiento', sub: 'CeVes enviados / faltantes', icon: '📋' },
  { key: 'carga',       label: 'Carga',       sub: 'Historial de cargas',        icon: '⬆' },
]

export default function SeguimientoServicios() {
  const [tab, setTab] = useState('seguimiento')
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Seguimiento Servicios</div>
          <div className="topbar-sub">Carga de Pedido vs Cargo por CeVe y seguimiento de quién ya envió su servicio</div>
        </div>
      </div>

      <div className="content">
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
              borderBottom: tab === t.key ? '2px solid #475569' : '2px solid transparent',
              marginBottom: -2, background: 'transparent',
              color: tab === t.key ? '#475569' : '#6b7280', transition: 'color 0.15s',
            }}>
              <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
              <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9ca3af', marginTop: 1 }}>{t.sub}</span>
            </button>
          ))}
        </div>

        {tab === 'seguimiento' && <TabSeguimiento reloadKey={reloadKey} />}
        {tab === 'carga'       && <TabCarga onSaved={() => setReloadKey(k => k + 1)} />}
      </div>
    </>
  )
}
