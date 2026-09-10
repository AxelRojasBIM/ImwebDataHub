import { useState, useEffect, useRef } from 'react'
import { API } from '../App'

const COLS = [
  'anio', 'semana', 'plan_comercial', 'canal', 'region', 'gerencia', 'cod_ceve',
  'item', 'producto', 'categoria', 'marca', 'meta_pzs', 'meta_importe', 'meta_dist',
]
const EJEMPLO = [
  '2026', '3', 'PlanQ1', 'Detalle', 'Centro', 'Gerencia Centro', '20279',
  '12345', 'Pan Blanco Grande', 'Panes', 'Bimbo', '1000', '18500.00', '50',
]
const UPLOAD_URL  = '/api/planes-comerciales/upload'
const BATCHES_URL = '/api/planes-comerciales/batches'
const DELETE_URL  = '/api/planes-comerciales/batches'

const REGLAS = [
  'Ninguna columna puede quedar vacía.',
  '\'meta_pzs\' y \'meta_dist\' deben ser mayores a cero.',
  'No se permiten filas duplicadas por anio + semana + canal + cod_ceve + item.',
]

function fmtDT(val) {
  if (!val) return '—'
  return new Date(val).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}
function fmtNum(n) { return n == null ? '—' : n.toLocaleString('es-MX') }

function descargarPlantilla() {
  const csv = `${COLS.join(',')}\n${EJEMPLO.join(',')}\n`
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'plantilla_planes_comerciales.csv'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const card = { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }
const cardTitle = { fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }

export default function PlanesComerciales() {
  const [file, setFile]         = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult]     = useState(null)
  const [batches, setBatches]   = useState([])
  const [loadingB, setLoadingB] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const inputRef = useRef(null)

  async function loadBatches() {
    setLoadingB(true)
    try {
      const r = await fetch(`${API}${BATCHES_URL}`)
      if (r.ok) setBatches(await r.json())
    } catch {}
    finally { setLoadingB(false) }
  }

  useEffect(() => { loadBatches() }, [])

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.toLowerCase().endsWith('.csv')) setFile(f)
    else alert('Solo se aceptan archivos .csv')
  }

  async function handleUpload() {
    if (!file) return
    if (!confirm(`¿Cargar "${file.name}"?`)) return
    setUploading(true); setResult(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const r = await fetch(`${API}${UPLOAD_URL}`, { method: 'POST', body: form })
      const text = await r.text()
      const d = text ? JSON.parse(text) : {}
      if (!r.ok) {
        setResult({ ok: false, msg: d.error || `HTTP ${r.status}`, errores: d.errores ?? [] })
        return
      }
      setResult({ ok: true, saved: d.saved })
      setFile(null)
      await loadBatches()
    } catch (e) {
      setResult({ ok: false, msg: e.message, errores: [] })
    } finally { setUploading(false) }
  }

  async function handleDelete(batchId, nombre) {
    if (!confirm(`¿Eliminar la carga "${nombre}"?`)) return
    setDeleting(batchId)
    try {
      await fetch(`${API}${DELETE_URL}/${batchId}`, { method: 'DELETE' })
      await loadBatches()
    } finally { setDeleting(null) }
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Planes Comerciales
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            Carga de metas comerciales por CeVe, canal e ítem.
          </p>
        </div>
        <button className="btn" onClick={descargarPlantilla} style={{ fontSize: 12.5 }}>
          ⬇ Descargar plantilla CSV
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(340px, 1.3fr)', gap: 16, alignItems: 'start' }}>
        {/* Plantilla / reglas */}
        <div style={card}>
          <div style={cardTitle}>Plantilla y reglas de carga</div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 10.5, whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  {COLS.map(c => (
                    <th key={c} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700,
                      color: '#3730a3', background: '#e0e7ff', fontFamily: 'monospace', borderBottom: '1px solid var(--border)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {EJEMPLO.map((v, i) => (
                    <td key={i} style={{ padding: '5px 8px', color: '#6b7280' }}>{v}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#4b5563', lineHeight: 1.7 }}>
            {REGLAS.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>

        {/* Carga */}
        <div style={card}>
          <div style={cardTitle}>Cargar archivo</div>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !file && inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#3b82f6' : file ? '#22c55e' : '#93c5fd'}`,
              borderRadius: 10, padding: '20px 18px', textAlign: 'center',
              cursor: file ? 'default' : 'pointer',
              background: dragging ? '#eff6ff' : file ? '#f0fdf4' : '#f8faff',
              transition: 'all .15s', marginBottom: 12,
            }}
          >
            <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }} />
            {file ? (
              <div>
                <div style={{ fontSize: 20, marginBottom: 4 }}>📄</div>
                <div style={{ fontWeight: 700, color: '#15803d', fontSize: 13 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
                <button onClick={e => { e.stopPropagation(); setFile(null) }}
                  style={{ marginTop: 8, fontSize: 12, padding: '3px 10px', borderRadius: 6,
                    border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
                  ✕ Quitar
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 24, marginBottom: 4 }}>☁</div>
                <div style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>
                  Arrastra el CSV o <span style={{ color: '#2563eb' }}>haz clic</span>
                </div>
              </div>
            )}
          </div>

          <button className="btn primary" onClick={handleUpload} disabled={!file || uploading}
            style={{ padding: '8px 24px', fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
            {uploading ? '⏳ Cargando…' : '↑ Cargar archivo'}
          </button>

          {result && (
            <div style={{ padding: '9px 14px', borderRadius: 8, fontSize: 13,
              background: result.ok ? '#ecfdf5' : '#fef2f2',
              color: result.ok ? '#065f46' : '#991b1b',
              border: `1px solid ${result.ok ? '#6ee7b7' : '#fca5a5'}` }}>
              {result.ok ? (
                `✓ ${fmtNum(result.saved)} registros cargados.`
              ) : (
                <div>
                  <div style={{ fontWeight: 700, marginBottom: result.errores?.length ? 8 : 0 }}>
                    ✕ Carga negada: {result.msg}
                  </div>
                  {result.errores?.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflowY: 'auto' }}>
                      {result.errores.map((err, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Historial */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={cardTitle}>Historial de cargas</div>
        {loadingB ? (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Cargando…</div>
        ) : batches.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '28px 0',
            border: '1px dashed var(--border)', borderRadius: 10 }}>Sin cargas registradas.</div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Archivo', 'Registros', 'Cargado el', ''].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600,
                      color: '#374151', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((b, i) => (
                  <tr key={b.batchId} style={{ borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 14px', maxWidth: 280, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#9ca3af', marginRight: 6 }}>
                        {b.batchId.slice(0, 8)}…
                      </span>
                      {b.nombreArchivo}
                    </td>
                    <td style={{ padding: '8px 14px', fontWeight: 600 }}>{fmtNum(b.totalFilas)}</td>
                    <td style={{ padding: '8px 14px' }}>{fmtDT(b.cargadoEn)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                      <button className="btn" onClick={() => handleDelete(b.batchId, b.nombreArchivo)}
                        disabled={deleting === b.batchId}
                        style={{ fontSize: 12, padding: '3px 10px', color: '#dc2626', borderColor: '#fca5a5' }}>
                        {deleting === b.batchId ? '…' : '🗑 Eliminar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
