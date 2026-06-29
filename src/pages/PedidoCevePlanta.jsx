import { useState, useRef } from 'react'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'
const COLS = ['Cod_ceve', 'Item', 'Cantidad', 'Fecha_Orden', 'Fecha_Venta']
const TEMPLATE_CSV = 'Cod_ceve,Item,Cantidad,Fecha_Orden,Fecha_Venta\n1001,ABC123,50,2026-06-29,2026-06-30\n'

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [], error: 'El archivo está vacío.' }

  const headers = lines[0].split(',').map(h => h.trim())
  const missing = COLS.filter(c => !headers.includes(c))
  if (missing.length > 0)
    return { headers, rows: [], error: `Columnas faltantes: ${missing.join(', ')}` }

  const rows = lines.slice(1).map(line => {
    const vals = line.split(',')
    return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() ?? '']))
  })
  return { headers, rows, error: null }
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'template_pedido_ceve_planta.csv'
  a.click()
}

export default function PedidoCevePlanta() {
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [parseError, setParseError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const inputRef = useRef()

  const handleFile = (f) => {
    if (!f) return
    setFile(f)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const { rows: parsed, error } = parseCSV(e.target.result)
      setParseError(error)
      setRows(parsed)
    }
    reader.readAsText(f)
  }

  const handleSave = async () => {
    if (rows.length === 0) return
    setSaving(true)
    setResult(null)
    try {
      const payload = rows.map(r => ({
        cod_ceve:    r.Cod_ceve,
        item:        r.Item,
        cantidad:    parseFloat(r.Cantidad) || 0,
        fecha_orden: r.Fecha_Orden,
        fecha_venta: r.Fecha_Venta,
      }))
      const res = await fetch(`${API}/api/pedidos/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) setResult({ ok: true, msg: data.message || `${data.saved} pedidos guardados.` })
      else setResult({ ok: false, msg: data.error || 'Error al guardar.' })
    } catch (e) {
      setResult({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  const reset = () => { setFile(null); setRows([]); setParseError(null); setResult(null) }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Pedido CeVe a Planta / Cedis</div>
          <div className="topbar-sub">Cargas masivas · {rows.length > 0 ? `${rows.length.toLocaleString()} filas listas` : 'sube un archivo CSV'}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn" onClick={downloadTemplate}>⬇ Descargar template</button>
        </div>
      </div>

      <div className="content" style={{ maxWidth: 860 }}>

        {/* Zona de carga */}
        {rows.length === 0 && (
          <>
            <div className="section-label">Cargar archivo</div>
            <div
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
              onDragOver={e => e.preventDefault()}
              onClick={() => inputRef.current.click()}
              style={{
                border: '2px dashed var(--border-strong)', borderRadius: 12,
                padding: '48px 20px', textAlign: 'center', cursor: 'pointer',
                background: 'var(--surface)', marginBottom: 16, transition: 'border-color 0.15s'
              }}
            >
              <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              <div style={{ fontSize: 32, marginBottom: 10 }}>📦</div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Arrastra el CSV aquí</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>o haz clic para seleccionar · solo .csv</div>
            </div>

            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--text-2)' }}>
              <strong>Columnas requeridas:</strong> {COLS.join(' · ')}
              <span style={{ marginLeft: 12, color: 'var(--text-3)' }}>Fechas en formato YYYY-MM-DD</span>
            </div>
          </>
        )}

        {/* Error de parseo */}
        {parseError && (
          <div className="error-msg" style={{ marginTop: 12 }}>
            {parseError}
            <button className="btn" style={{ marginLeft: 12 }} onClick={reset}>Reintentar</button>
          </div>
        )}

        {/* Preview de filas */}
        {rows.length > 0 && !parseError && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 500 }}>{file?.name}</span>
                <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-3)' }}>{rows.length.toLocaleString()} filas</span>
              </div>
              <button className="btn" onClick={reset}>✕ Cambiar archivo</button>
            </div>

            <div className="table-wrap" style={{ marginBottom: 14, maxHeight: 360, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>{COLS.map(c => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i}>
                      <td>{r.Cod_ceve}</td>
                      <td>{r.Item}</td>
                      <td style={{ textAlign: 'right' }}>{r.Cantidad}</td>
                      <td>{r.Fecha_Orden}</td>
                      <td>{r.Fecha_Venta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && (
                <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
                  Mostrando 100 de {rows.length.toLocaleString()} filas. Se guardarán todas.
                </div>
              )}
            </div>

            {result && (
              <div style={{
                marginBottom: 12, padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13,
                background: result.ok ? 'var(--success-bg)' : '#fcebeb',
                color: result.ok ? 'var(--success-text)' : '#a32d2d',
                border: `1px solid ${result.ok ? '#c0dd97' : '#f09595'}`
              }}>
                {result.ok ? '✓ ' : '✕ '}{result.msg}
              </div>
            )}

            <button
              className="btn primary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14 }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Guardando...' : `☁ Guardar ${rows.length.toLocaleString()} filas en la base de datos`}
            </button>
          </>
        )}

      </div>
    </>
  )
}
