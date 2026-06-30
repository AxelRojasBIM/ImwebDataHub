import { useState, useRef, useEffect, useCallback } from 'react'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'

const COLS = [
  'Cod_ceve','Nombre_Indicadores_Almacenes_CeVe','Region','Organizacion',
  'Area_Negocio','Gerente','Correo_Gerente','Subgerente','Correo_Subgerente',
  'Coordinador','Correo_Coordinador','Direccion','Latitud','Longitud','CeVe_Sinergia'
]

const COL_ALIASES = { 'Organización': 'Organizacion', 'Área_Negocio': 'Area_Negocio' }

const TEMPLATE = `Cod_ceve,Nombre_Indicadores_Almacenes_CeVe,Region,Organizacion,Area_Negocio,Gerente,Correo_Gerente,Subgerente,Correo_Subgerente,Coordinador,Correo_Coordinador,Direccion,Latitud,Longitud,CeVe_Sinergia
12858,Texmelucan,Sur,Barcel,2001,Oscar Arnulfo Esquivel,oscar.esquivel@grupobimbo.com,Rosario Julieta Zafra,rosario.j.zafra@grupobimbo.com,Axel Fernando Rojas,axel.rojas@grupobimbo.com,Av. Centenario,19.296,-98.474,12405
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

const PREVIEW_COLS = ['Cod_ceve','Nombre_Indicadores_Almacenes_CeVe','Region','Organizacion','Area_Negocio','Gerente']

export default function CatalogoCeves() {
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
      const { rows: parsed, error } = parseCSV(e.target.result)
      setParseError(error)
      setRows(parsed)
    }
    reader.readAsText(f, 'UTF-8')
  }

  const handleSave = async () => {
    if (!rows.length) return
    setSaving(true)
    setSaveResult(null)
    const batchId = crypto.randomUUID()
    const mapped = rows.map(r => ({
      cod_ceve:                         r.Cod_ceve,
      nombre_indicadores_almacenes_ceve: r.Nombre_Indicadores_Almacenes_CeVe,
      region:                           r.Region,
      organizacion:                     r.Organizacion,
      area_negocio:                     r.Area_Negocio,
      gerente:                          r.Gerente,
      correo_gerente:                   r.Correo_Gerente,
      subgerente:                       r.Subgerente,
      correo_subgerente:                r.Correo_Subgerente,
      coordinador:                      r.Coordinador,
      correo_coordinador:               r.Correo_Coordinador,
      direccion:                        r.Direccion,
      latitud:                          parseFloat(r.Latitud) || null,
      longitud:                         parseFloat(r.Longitud) || null,
      ceve_sinergia:                    r.CeVe_Sinergia,
    }))
    const CHUNK = 5_000
    let saved = 0
    try {
      for (let i = 0; i < mapped.length; i += CHUNK) {
        const res = await fetch(`${API}/api/ceves/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, rows: mapped.slice(i, i + CHUNK) }),
        })
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
    } catch (e) {
      setSaveResult({ ok: false, msg: e.message })
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
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Catálogo de CEVEs</div>
          <div className="topbar-sub">Carga masiva de CEVEs con información de contacto y ubicación</div>
        </div>
        <div className="topbar-actions">
          <button className="btn" onClick={downloadTemplate}>⬇ Template CSV</button>
          <button className="btn primary" onClick={() => inputRef.current.click()}>↑ Cargar CSV</button>
          <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        </div>
      </div>

      <div className="content">

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
            style={{ border: '2px dashed #93b4fd', borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: '#f0f4ff', marginBottom: 20 }}
          >
            <div style={{ fontSize: 28, marginBottom: 8, color: '#1a56db' }}>◈</div>
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
              ) : batches.map(b => (
                <tr key={b.batchId}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#4b5563' }}>{b.batchId}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(b.filas).toLocaleString()}</td>
                  <td style={{ fontSize: 12, color: '#6b7280' }}>{fmtDT(b.cargadoEn)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn" style={{ fontSize: 12, padding: '4px 12px', fontWeight: 500 }} onClick={() => handleView(b)}>Ver</button>
                      <button className="btn" style={{ fontSize: 12, padding: '4px 12px', color: '#1a56db', borderColor: '#93b4fd', background: '#eff4ff', fontWeight: 600 }} onClick={() => handleDownload(b)}>↓ CSV</button>
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
                  <thead><tr>{PREVIEW_COLS.map(c => <th key={c}>{c}</th>)}<th>Latitud</th><th>Longitud</th><th>CeVe_Sinergia</th></tr></thead>
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
    </>
  )
}
