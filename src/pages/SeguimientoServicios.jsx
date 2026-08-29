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
  const filtered = q
    ? ceves.filter(c => (c.codCeve || '').toLowerCase().includes(q) || (c.nombre || '').toLowerCase().includes(q))
    : ceves

  const pct = resumen && resumen.total > 0 ? Math.round((resumen.enviados / resumen.total) * 100) : 0

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
        <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={loadResumen}>↻ Actualizar</button>
      </div>

      {/* Stat cards */}
      {resumen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500, marginBottom: 6 }}>Total CeVes</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{resumen.total}</div>
          </div>
          <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
            <div style={{ fontSize: 12, color: '#065f46', fontWeight: 500, marginBottom: 6 }}>Enviados</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#065f46' }}>{resumen.enviados} <span style={{ fontSize: 14, fontWeight: 600 }}>({pct}%)</span></div>
          </div>
          <div style={{ background: resumen.faltantes > 0 ? '#fef2f2' : '#f3f4f6', border: `1px solid ${resumen.faltantes > 0 ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
            <div style={{ fontSize: 12, color: resumen.faltantes > 0 ? '#991b1b' : '#6b7280', fontWeight: 500, marginBottom: 6 }}>Faltantes</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: resumen.faltantes > 0 ? '#991b1b' : '#6b7280' }}>{resumen.faltantes}</div>
          </div>
        </div>
      )}

      {/* Barra de progreso */}
      {resumen && resumen.total > 0 && (
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
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Filas cargadas</th>
              <th>Última carga</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="loading">Cargando...</td></tr>
            ) : !fecha ? (
              <tr><td colSpan={5} className="empty">Sube un CSV para empezar a ver el seguimiento.</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="empty">Sin resultados para ese filtro.</td></tr>
            ) : filtered.map(c => (
              <tr key={c.codCeve} style={{ background: c.enviado ? undefined : '#fef2f2' }}>
                <td style={{ fontWeight: 600 }}>{c.codCeve}</td>
                <td>{c.nombre || '—'}</td>
                <td>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99,
                    fontSize: 11.5, fontWeight: 700,
                    background: c.enviado ? '#ecfdf5' : '#fef2f2',
                    border: `1px solid ${c.enviado ? '#6ee7b7' : '#fca5a5'}`,
                    color: c.enviado ? '#065f46' : '#991b1b',
                  }}>
                    {c.enviado ? '✓ Enviado' : '✕ Falta'}
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: c.enviado ? 600 : 400, color: c.enviado ? 'var(--text)' : '#9ca3af' }}>
                  {c.enviado ? fmtNum(c.filas) : '—'}
                </td>
                <td style={{ fontSize: 12, color: '#6b7280' }}>{fmtDT(c.ultimaCarga)}</td>
              </tr>
            ))}
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
