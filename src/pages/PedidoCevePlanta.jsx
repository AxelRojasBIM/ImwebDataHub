import { useState, useRef, useEffect, useCallback } from 'react'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'
const COLS = ['Cod_ceve', 'Item', 'Cantidad', 'Fecha_Orden', 'Fecha_Venta']
const TEMPLATE = 'Cod_ceve,Item,Cantidad,Fecha_Orden,Fecha_Venta\n1001,ABC123,50,2026-06-29,2026-06-30\n'

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (lines.length < 2) return { rows: [], error: 'El archivo está vacío.' }
  const headers = lines[0].split(',').map(h => h.trim())
  const missing = COLS.filter(c => !headers.includes(c))
  if (missing.length) return { rows: [], error: `Columnas faltantes: ${missing.join(', ')}` }
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',')
    return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() ?? '']))
  })
  return { rows, error: null }
}

function downloadTemplate() {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }))
  a.download = 'template_pedido_ceve_planta.csv'
  a.click()
}

function downloadBatchCSV(batch, rows) {
  const csv = [COLS.join(','), ...rows.map(r => COLS.map(c => r[c.toLowerCase().replace('_', '_')] ?? r[c] ?? '').join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `pedido_${batch.batchId.slice(0, 8)}_${batch.fechaVenta ?? ''}.csv`
  a.click()
}

function fmtDate(val) {
  if (!val) return '—'
  const s = typeof val === 'string' ? val : String(val)
  return s.slice(0, 10)
}

function fmtDateTime(val) {
  if (!val) return '—'
  const s = typeof val === 'string' ? val : String(val)
  return s.slice(0, 16).replace('T', ' ')
}

export default function PedidoCevePlanta() {
  const [file, setFile]           = useState(null)
  const [rows, setRows]           = useState([])
  const [parseError, setParseError] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [saveResult, setSaveResult] = useState(null)
  const [batches, setBatches]     = useState([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [viewBatch, setViewBatch] = useState(null)
  const [viewRows, setViewRows]   = useState([])
  const [loadingView, setLoadingView] = useState(false)
  const inputRef = useRef()

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true)
    try {
      const r = await fetch(`${API}/api/pedidos/batches`)
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
    reader.readAsText(f)
  }

  const handleSave = async () => {
    if (!rows.length) return
    setSaving(true)
    setSaveResult(null)
    try {
      const payload = {
        batchId: crypto.randomUUID(),
        rows: rows.map(r => ({
          cod_ceve:    r.Cod_ceve,
          item:        r.Item,
          cantidad:    parseFloat(r.Cantidad) || 0,
          fecha_orden: r.Fecha_Orden,
          fecha_venta: r.Fecha_Venta,
        }))
      }
      const res = await fetch(`${API}/api/pedidos/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        setSaveResult({ ok: true, msg: data.message })
        setFile(null); setRows([])
        await loadBatches()
      } else {
        setSaveResult({ ok: false, msg: data.error || 'Error al guardar.' })
      }
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
      const r = await fetch(`${API}/api/pedidos/batches/${batch.batchId}`)
      setViewRows(r.ok ? await r.json() : [])
    } catch { setViewRows([]) }
    finally { setLoadingView(false) }
  }

  const handleDelete = async (batchId) => {
    if (!confirm('¿Eliminar esta carga? Se borrarán todas las filas del batch.')) return
    await fetch(`${API}/api/pedidos/batches/${batchId}`, { method: 'DELETE' })
    setBatches(b => b.filter(x => x.batchId !== batchId))
    if (viewBatch?.batchId === batchId) setViewBatch(null)
  }

  const handleDownloadBatch = async (batch) => {
    const r = await fetch(`${API}/api/pedidos/batches/${batch.batchId}`)
    if (!r.ok) return
    const data = await r.json()
    const csv = [COLS.join(','), ...data.map(r =>
      `${r.cod_ceve},${r.item},${r.cantidad},${fmtDate(r.fecha_orden)},${fmtDate(r.fecha_venta)}`
    )].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `pedido_${batch.batchId.slice(0, 8)}.csv`
    a.click()
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Pedido CeVe a Planta / Cedis</div>
          <div className="topbar-sub">Carga de pedidos por CeVe y producto</div>
        </div>
        <div className="topbar-actions">
          <button className="btn" onClick={downloadTemplate}>⬇ Template CSV</button>
          <button className="btn primary" onClick={() => inputRef.current.click()}>↑ Cargar CSV</button>
          <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        </div>
      </div>

      <div className="content">

        {/* Zona de carga — solo visible si hay archivo seleccionado o errores */}
        {(file || parseError || saveResult) && (
          <div style={{ marginBottom: 16 }}>
            {parseError && (
              <div className="error-msg">{parseError} <button className="btn" style={{ marginLeft: 10 }} onClick={() => { setFile(null); setRows([]); setParseError(null) }}>Reintentar</button></div>
            )}
            {saveResult && (
              <div style={{
                padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 10,
                background: saveResult.ok ? 'var(--success-bg)' : '#fcebeb',
                color: saveResult.ok ? 'var(--success-text)' : '#a32d2d',
                border: `1px solid ${saveResult.ok ? '#c0dd97' : '#f09595'}`
              }}>
                {saveResult.ok ? '✓ ' : '✕ '}{saveResult.msg}
              </div>
            )}
            {file && !parseError && rows.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{file.name}</span>
                    <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-3)' }}>{rows.length.toLocaleString()} filas</span>
                  </div>
                  <button className="btn" onClick={() => { setFile(null); setRows([]) }}>✕ Cancelar</button>
                </div>
                <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
                  <table>
                    <thead><tr>{COLS.map(c => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>
                      {rows.slice(0, 50).map((r, i) => (
                        <tr key={i}>
                          <td>{r.Cod_ceve}</td><td>{r.Item}</td>
                          <td style={{ textAlign: 'right' }}>{r.Cantidad}</td>
                          <td>{r.Fecha_Orden}</td><td>{r.Fecha_Venta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 50 && <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>Mostrando 50 de {rows.length.toLocaleString()} · se guardarán todas</div>}
                </div>
                <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '9px 0' }} onClick={handleSave} disabled={saving}>
                  {saving ? 'Guardando...' : `☁ Guardar ${rows.length.toLocaleString()} filas en la base de datos`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Zona de drop cuando no hay archivo */}
        {!file && !saveResult && (
          <div
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
            onDragOver={e => e.preventDefault()}
            onClick={() => inputRef.current.click()}
            style={{ border: '2px dashed var(--border-strong)', borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface)', marginBottom: 16 }}
          >
            <div style={{ fontSize: 22, marginBottom: 6 }}>↑</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Arrastra un CSV aquí o haz clic para seleccionarlo</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Formato: {COLS.join(', ')}</div>
          </div>
        )}

        {/* Historial de cargas */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontWeight: 500, fontSize: 14 }}>Historial de cargas</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{batches.length} cargas</span>
          </div>
          <button className="btn" onClick={loadBatches}>↻ Actualizar</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch ID</th>
                <th>Fecha venta</th>
                <th style={{ textAlign: 'right' }}>Filas</th>
                <th>Cargado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loadingBatches ? (
                <tr><td colSpan={5} className="loading">Cargando...</td></tr>
              ) : batches.length === 0 ? (
                <tr><td colSpan={5} className="empty">Sin cargas. Sube tu primer CSV arriba.</td></tr>
              ) : batches.map(b => (
                <tr key={b.batchId}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-2)' }}>{b.batchId}</td>
                  <td>{fmtDate(b.fechaVenta)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{Number(b.filas).toLocaleString()}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtDateTime(b.cargadoEn)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleView(b)}>Ver</button>
                      <button className="btn" style={{ fontSize: 12, padding: '4px 10px', color: '#185FA5' }} onClick={() => handleDownloadBatch(b)}>↓ CSV</button>
                      <button className="btn" style={{ fontSize: 12, padding: '4px 10px', color: '#a32d2d', borderColor: '#f09595' }} onClick={() => handleDelete(b.batchId)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Panel detalle de batch */}
        {viewBatch && (
          <div style={{ marginTop: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 500, fontSize: 13 }}>Detalle — </span>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-3)' }}>{viewBatch.batchId}</span>
              </div>
              <button className="btn" onClick={() => setViewBatch(null)}>✕ Cerrar</button>
            </div>
            {loadingView ? (
              <div className="loading">Cargando filas...</div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table>
                  <thead><tr>{COLS.map(c => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {viewRows.slice(0, 200).map((r, i) => (
                      <tr key={i}>
                        <td>{r.cod_ceve}</td><td>{r.item}</td>
                        <td style={{ textAlign: 'right' }}>{r.cantidad}</td>
                        <td>{fmtDate(r.fecha_orden)}</td><td>{fmtDate(r.fecha_venta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {viewRows.length > 200 && <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>Mostrando 200 de {viewRows.length.toLocaleString()}</div>}
              </div>
            )}
          </div>
        )}

      </div>
    </>
  )
}
