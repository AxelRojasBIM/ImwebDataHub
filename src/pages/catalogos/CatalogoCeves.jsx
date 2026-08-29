import { useState, useRef, useEffect, useCallback } from 'react'
import { fetchWithRetry } from '../../apiUtils'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'

const COLS = [
  'Cod_ceve','Nombre_Indicadores_Almacenes_CeVe','Region','Organizacion',
  'Area_Negocio','Gerente','Correo_Gerente','Subgerente','Correo_Subgerente',
  'Coordinador','Correo_Coordinador','Direccion','Latitud','Longitud','CeVe_Sinergia','Turno_Laboral'
]

const COL_ALIASES = { 'Organización': 'Organizacion', 'Área_Negocio': 'Area_Negocio', 'Turno Laboral': 'Turno_Laboral' }

const TEMPLATE = `Cod_ceve,Nombre_Indicadores_Almacenes_CeVe,Region,Organizacion,Area_Negocio,Gerente,Correo_Gerente,Subgerente,Correo_Subgerente,Coordinador,Correo_Coordinador,Direccion,Latitud,Longitud,CeVe_Sinergia,Turno_Laboral
12858,Texmelucan,Sur,Barcel,2001,Oscar Arnulfo Esquivel,oscar.esquivel@grupobimbo.com,Rosario Julieta Zafra,rosario.j.zafra@grupobimbo.com,Axel Fernando Rojas,axel.rojas@grupobimbo.com,Av. Centenario,19.296,-98.474,12405,Matutino
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
  const rawHeaders = splitCSVLine(lines[0]).map(h => h.trim())
  const headers = rawHeaders.map(h => COL_ALIASES[h] ?? h)
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
  a.download = 'template_ceves.csv'
  a.click()
}

function fmtDT(val) { return val ? String(val).slice(0, 16).replace('T', ' ') : '—' }

// Excel en Windows exporta "CSV" en ANSI/Windows-1252 por defecto, no UTF-8 —
// forzar UTF-8 vuelve cada acento (é, ñ, ó...) un carácter de reemplazo (�)
// irrecuperable. U+FFFD solo aparece cuando los bytes NO son UTF-8 real, así
// que si aparece reinterpretamos el mismo buffer como Windows-1252.
function decodeCsvBuffer(buffer) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (utf8.includes('�')) {
    try { return new TextDecoder('windows-1252').decode(buffer) } catch { return utf8 }
  }
  return utf8
}

const PREVIEW_COLS = ['Cod_ceve','Nombre_Indicadores_Almacenes_CeVe','Region','Organizacion','Area_Negocio','Gerente']

// ── Tab: Carga ───────────────────────────────────────────────────────────────
function TabCarga({ onSaved }) {
  const [file, setFile]             = useState(null)
  const [rows, setRows]             = useState([])
  const [parseError, setParseError] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [saveResult, setSaveResult] = useState(null)
  const [batches, setBatches]       = useState([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [viewBatch, setViewBatch]   = useState(null)
  const [viewRows, setViewRows]     = useState([])
  const [loadingView, setLoadingView] = useState(false)
  const inputRef = useRef()

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true)
    try {
      const r = await fetch(`${API}/api/ceves/batches`)
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
      cod_ceve:                          r.Cod_ceve,
      nombre_indicadores_almacenes_ceve: r.Nombre_Indicadores_Almacenes_CeVe,
      region:                            r.Region,
      organizacion:                      r.Organizacion,
      area_negocio:                      r.Area_Negocio,
      gerente:                           r.Gerente,
      correo_gerente:                    r.Correo_Gerente,
      subgerente:                        r.Subgerente,
      correo_subgerente:                 r.Correo_Subgerente,
      coordinador:                       r.Coordinador,
      correo_coordinador:                r.Correo_Coordinador,
      direccion:                         r.Direccion,
      latitud:                           parseFloat(r.Latitud) || null,
      longitud:                          parseFloat(r.Longitud) || null,
      ceve_sinergia:                     r.CeVe_Sinergia,
      turno_laboral:                     r.Turno_Laboral,
    }))
    const CHUNK = 5_000
    let saved = 0
    try {
      for (let i = 0; i < mapped.length; i += CHUNK) {
        const res = await fetchWithRetry(
          `${API}/api/ceves/sync`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId, rows: mapped.slice(i, i + CHUNK) }) },
          { onWaking: () => setSaveResult({ ok: true, msg: '⏳ La API está despertando, reintentando en 4 segundos…' }) }
        )
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.detail || d.error || d.title || `HTTP ${res.status}`)
        }
        const d = await res.json()
        saved += d.saved ?? CHUNK
        setSaveResult({ ok: true, msg: `Guardando... ${saved.toLocaleString()} / ${rows.length.toLocaleString()} CEVEs` })
      }
      setSaveResult({ ok: true, msg: `✓ ${saved.toLocaleString()} CEVEs guardados.` })
      setFile(null); setRows([])
      await loadBatches()
      onSaved?.()
    } catch (e) {
      setSaveResult({ ok: false, msg: 'No se pudo conectar con la API. Intenta de nuevo en unos segundos.' })
    } finally {
      setSaving(false)
    }
  }

  const handleView = async (batch) => {
    setViewBatch(batch)
    setLoadingView(true)
    try {
      const r = await fetch(`${API}/api/ceves/batches/${batch.batchId}`)
      setViewRows(r.ok ? await r.json() : [])
    } catch { setViewRows([]) }
    finally { setLoadingView(false) }
  }

  const handleDelete = async (batchId) => {
    if (!confirm('¿Eliminar esta carga de CEVEs?')) return
    await fetch(`${API}/api/ceves/batches/${batchId}`, { method: 'DELETE' })
    setBatches(b => b.filter(x => x.batchId !== batchId))
    if (viewBatch?.batchId === batchId) setViewBatch(null)
    onSaved?.()
  }

  const handleDownload = async (batch) => {
    const r = await fetch(`${API}/api/ceves/batches/${batch.batchId}`)
    if (!r.ok) return
    const data = await r.json()
    const csv = [COLS.join(','), ...data.map(r =>
      COLS.map(c => r[c.toLowerCase()] ?? '').join(',')
    )].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `ceves_${batch.batchId.slice(0, 8)}.csv`
    a.click()
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
              <span style={{ marginLeft: 10, fontSize: 12, color: '#6b7280' }}>{rows.length.toLocaleString()} CEVEs</span>
            </div>
            <button className="btn" onClick={() => { setFile(null); setRows([]) }}>✕ Cancelar</button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
            <table>
              <thead><tr>{PREVIEW_COLS.map(c => <th key={c}>{c}</th>)}<th>...</th></tr></thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    {PREVIEW_COLS.map(c => <td key={c}>{r[c]}</td>)}
                    <td style={{ color: '#9ca3af', fontSize: 11 }}>+{COLS.length - PREVIEW_COLS.length} cols</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && <div style={{ padding: '6px 12px', fontSize: 12, color: '#9ca3af', borderTop: '1px solid var(--border)' }}>Mostrando 50 de {rows.length.toLocaleString()}</div>}
          </div>
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '9px 0' }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : `☁ Guardar ${rows.length.toLocaleString()} CEVEs en la base de datos`}
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
              <th style={{ textAlign: 'right' }}>CEVEs</th>
              <th>Cargado</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loadingBatches ? (
              <tr><td colSpan={4} className="loading">Cargando...</td></tr>
            ) : batches.length === 0 ? (
              <tr><td colSpan={4} className="empty">Sin cargas. Sube tu primer CSV arriba.</td></tr>
            ) : batches.map((b, i) => (
              <tr key={b.batchId}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#4b5563' }}>
                  {b.batchId}
                  {i === 0 && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 99, padding: '1px 8px' }}>ACTUAL</span>}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(b.filas).toLocaleString()}</td>
                <td style={{ fontSize: 12, color: '#6b7280' }}>{fmtDT(b.cargadoEn)}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 12px', fontWeight: 500 }} onClick={() => handleView(b)}>Ver</button>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 12px', color: '#475569', borderColor: '#d1d5db', background: '#f3f4f6', fontWeight: 600 }} onClick={() => handleDownload(b)}>↓ CSV</button>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 12px', color: '#991b1b', borderColor: '#fca5a5', background: '#fef2f2', fontWeight: 600 }} onClick={() => handleDelete(b.batchId)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detalle batch */}
      {viewBatch && (
        <div style={{ marginTop: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Detalle — </span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#9ca3af' }}>{viewBatch.batchId}</span>
            </div>
            <button className="btn" onClick={() => setViewBatch(null)}>✕ Cerrar</button>
          </div>
          {loadingView ? <div className="loading">Cargando...</div> : (
            <div style={{ maxHeight: 360, overflowY: 'auto', overflowX: 'auto' }}>
              <table>
                <thead><tr>{PREVIEW_COLS.map(c => <th key={c}>{c}</th>)}<th>Latitud</th><th>Longitud</th><th>CeVe_Sinergia</th><th>Turno_Laboral</th></tr></thead>
                <tbody>
                  {viewRows.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      <td>{r.cod_ceve}</td>
                      <td>{r.nombre_indicadores_almacenes_ceve}</td>
                      <td>{r.region}</td>
                      <td>{r.organizacion}</td>
                      <td>{r.area_negocio}</td>
                      <td>{r.gerente}</td>
                      <td style={{ textAlign: 'right' }}>{r.latitud}</td>
                      <td style={{ textAlign: 'right' }}>{r.longitud}</td>
                      <td>{r.ceve_sinergia}</td>
                      <td>{r.turno_laboral}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {viewRows.length > 200 && <div style={{ padding: '6px 12px', fontSize: 12, color: '#9ca3af', borderTop: '1px solid var(--border)' }}>Mostrando 200 de {viewRows.length.toLocaleString()}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab: CeVes cargados (catálogo actual) ──────────────────────────────────
const TURNOS = ['Matutino', 'Vespertino', 'Nocturno', 'Mixto']
const CEVES_PAGE_SIZE = 30

async function saveCeveCampo(id, campo, valor) {
  await fetch(`${API}/api/ceves/${id}/campo`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campo, valor: valor || null }),
  })
}

function TurnoLaboralCell({ row, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(row.turno_laboral ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setValue(row.turno_laboral ?? '') }, [row.turno_laboral])

  async function save(nextValue) {
    const v = nextValue ?? value
    setEditing(false)
    if ((v || '') === (row.turno_laboral ?? '')) return
    setSaving(true)
    try {
      await saveCeveCampo(row.id, 'turnoLaboral', v)
      onSaved(row.id, 'turno_laboral', v)
    } catch { /* deja el valor visible como estaba; el usuario puede reintentar */ }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <select
        autoFocus
        value={value}
        disabled={saving}
        onChange={e => { setValue(e.target.value); save(e.target.value) }}
        onBlur={() => setEditing(false)}
        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5, background: '#fff' }}
      >
        <option value="">— sin asignar —</option>
        {TURNOS.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    )
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Clic para editar"
      style={{
        cursor: 'pointer', padding: '3px 9px', borderRadius: 99, fontSize: 12, fontWeight: 600,
        opacity: saving ? 0.5 : 1,
        background: row.turno_laboral ? '#f3f4f6' : '#f3f4f6',
        border: `1px solid ${row.turno_laboral ? '#d1d5db' : '#e5e7eb'}`,
        color: row.turno_laboral ? '#1e3a8a' : '#9ca3af',
      }}
    >
      {row.turno_laboral || '— asignar —'}
    </span>
  )
}

// Celda de 2 opciones (RTM/Integral Vending: Activo-Inactivo, Compartido/Propio:
// Propio-Compartido) — mismo patrón de clic-para-editar que TurnoLaboralCell, pero
// generalizado: la primera opción de `options` se pinta en verde (el estado
// "positivo" por defecto), la segunda en gris.
function ToggleBadgeCell({ row, campo, field, value, options, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const isPositive = value === options[0]

  async function save(nextValue) {
    setEditing(false)
    if (nextValue === value) return
    setSaving(true)
    try {
      await saveCeveCampo(row.id, campo, nextValue)
      onSaved(row.id, field, nextValue)
    } catch { /* deja el valor visible como estaba; el usuario puede reintentar */ }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <select
        autoFocus
        value={value ?? options[1]}
        disabled={saving}
        onChange={e => save(e.target.value)}
        onBlur={() => setEditing(false)}
        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5, background: '#fff' }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Clic para editar"
      style={{
        cursor: 'pointer', padding: '3px 9px', borderRadius: 99, fontSize: 12, fontWeight: 600,
        opacity: saving ? 0.5 : 1,
        background: isPositive ? '#ecfdf5' : '#f3f4f6',
        border: `1px solid ${isPositive ? '#6ee7b7' : '#e5e7eb'}`,
        color: isPositive ? '#065f46' : '#6b7280',
      }}
    >
      {value || options[1]}
    </span>
  )
}

// Celda de texto libre editable — usada para Nombre CeVe, Región, Gerente,
// Subgerente y Coordinador. Clic para editar, Enter/blur guarda, Esc cancela.
function EditableTextCell({ row, campo, field, value, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setVal(value ?? '') }, [value])

  async function save() {
    setEditing(false)
    if ((val || '') === (value ?? '')) return
    setSaving(true)
    try {
      await saveCeveCampo(row.id, campo, val)
      onSaved(row.id, field, val)
    } catch { setVal(value ?? '') }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        disabled={saving}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setVal(value ?? ''); setEditing(false) }
        }}
        style={{ width: '100%', padding: '4px 7px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' }}
      />
    )
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Clic para editar"
      className={'editable-cell' + (value ? '' : ' empty')}
      style={{ opacity: saving ? 0.5 : 1 }}
    >
      {value || '— editar —'}
    </span>
  )
}

function TabActual({ reloadKey }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/ceves/actuales`)
      setRows(r.ok ? await r.json() : [])
    } catch { setRows([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load, reloadKey])

  function handleSavedCampo(id, field, value) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? rows.filter(r => (r.cod_ceve || '').toLowerCase().includes(q) || (r.nombre_indicadores_almacenes_ceve || '').toLowerCase().includes(q))
    : rows

  useEffect(() => { setPage(1) }, [search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / CEVES_PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * CEVES_PAGE_SIZE, page * CEVES_PAGE_SIZE)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar CeVe o nombre..."
          style={{ flex: '0 1 280px', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{filtered.length.toLocaleString()} CEVEs · versión más reciente de cada uno</span>
          <button className="btn" onClick={load}>↻ Actualizar</button>
        </div>
      </div>

      <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>CeVe</th>
              <th>Nombre CeVe</th>
              <th>Región</th>
              <th>Gerente</th>
              <th>Subgerente</th>
              <th>Coordinador</th>
              <th>Turno Laboral</th>
              <th>RTM</th>
              <th>Integral Vending</th>
              <th>Compartido/Propio</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="loading">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="empty">{rows.length === 0 ? 'Aún no hay CEVEs cargados.' : 'Sin resultados para ese filtro.'}</td></tr>
            ) : pageRows.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.cod_ceve}</td>
                <td><EditableTextCell row={r} campo="nombre" field="nombre_indicadores_almacenes_ceve" value={r.nombre_indicadores_almacenes_ceve} onSaved={handleSavedCampo} /></td>
                <td><EditableTextCell row={r} campo="region" field="region" value={r.region} onSaved={handleSavedCampo} /></td>
                <td><EditableTextCell row={r} campo="gerente" field="gerente" value={r.gerente} onSaved={handleSavedCampo} /></td>
                <td><EditableTextCell row={r} campo="subgerente" field="subgerente" value={r.subgerente} onSaved={handleSavedCampo} /></td>
                <td><EditableTextCell row={r} campo="coordinador" field="coordinador" value={r.coordinador} onSaved={handleSavedCampo} /></td>
                <td><TurnoLaboralCell row={r} onSaved={handleSavedCampo} /></td>
                <td><ToggleBadgeCell row={r} campo="rtm" field="rtm" value={r.rtm} options={['Activo', 'Inactivo']} onSaved={handleSavedCampo} /></td>
                <td><ToggleBadgeCell row={r} campo="integralVending" field="integral_vending" value={r.integral_vending} options={['Activo', 'Inactivo']} onSaved={handleSavedCampo} /></td>
                <td><ToggleBadgeCell row={r} campo="compartidoPropio" field="compartido_propio" value={r.compartido_propio} options={['Propio', 'Compartido']} onSaved={handleSavedCampo} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <button className="btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Anterior</button>
          <span style={{ fontSize: 13, color: '#6b7280' }}>Pág {page} / {totalPages}</span>
          <button className="btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Siguiente ›</button>
        </div>
      )}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
const TABS = [
  { key: 'carga',  label: 'Carga',         sub: 'Historial de cargas',  icon: '⬆' },
  { key: 'actual', label: 'CeVes cargados', sub: 'Catálogo actual',     icon: '📍' },
]

export default function CatalogoCeves() {
  const [tab, setTab] = useState('carga')
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Catálogo de CEVEs</div>
          <div className="topbar-sub">Carga masiva de CEVEs con información de contacto y ubicación</div>
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

        {tab === 'carga'  && <TabCarga onSaved={() => setReloadKey(k => k + 1)} />}
        {tab === 'actual' && <TabActual reloadKey={reloadKey} />}
      </div>
    </>
  )
}
