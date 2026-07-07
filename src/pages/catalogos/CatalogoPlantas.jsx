import { useState, useEffect, useRef } from 'react'
import { API } from '../../App'

function fmtDT(val) {
  if (!val) return '—'
  return new Date(val).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}
function fmtNum(n) { return n == null ? '—' : n.toLocaleString('es-MX') }

const COLS = ['Planta', 'CODIGO', 'WH', 'CUSTOMER_NAME']
const UPLOAD_URL  = '/api/cat-oracle/plantas/upload'
const BATCHES_URL = '/api/cat-oracle/plantas/batches'
const DELETE_URL  = '/api/cat-oracle/plantas/batches'

export default function CatalogoPlantas() {
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
      if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`)
      setResult({ ok: true, saved: d.saved })
      setFile(null)
      await loadBatches()
    } catch (e) {
      setResult({ ok: false, msg: e.message })
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
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
          Plantas / Cedis
        </h1>
        <p style={{ margin: '5px 0 0', fontSize: 13, color: '#6b7280' }}>
          Catálogo de plantas y cedis (Planta, código, WH y cliente).
        </p>
      </div>

      <div style={{ background: '#f8faff', border: '1px solid #c7d7fd', borderRadius: 14, padding: '20px 22px' }}>
        {/* Columnas */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {COLS.map((c, i) => (
            <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99,
              background: '#e0e7ff', color: '#3730a3', fontFamily: 'monospace' }}>{c}</span>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !file && inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#3b82f6' : file ? '#22c55e' : '#93c5fd'}`,
            borderRadius: 10, padding: '22px 20px', textAlign: 'center',
            cursor: file ? 'default' : 'pointer',
            background: dragging ? '#eff6ff' : file ? '#f0fdf4' : '#fff',
            transition: 'all .15s', marginBottom: 12,
          }}
        >
          <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }} />
          {file ? (
            <div>
              <div style={{ fontSize: 22, marginBottom: 4 }}>📄</div>
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
              <div style={{ fontSize: 26, marginBottom: 6 }}>☁</div>
              <div style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>
                Arrastra el CSV o <span style={{ color: '#2563eb' }}>haz clic</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <button className="btn primary" onClick={handleUpload} disabled={!file || uploading}
            style={{ padding: '8px 24px', fontWeight: 700, fontSize: 13 }}>
            {uploading ? '⏳ Cargando…' : '↑ Cargar archivo'}
          </button>
        </div>

        {result && (
          <div style={{ padding: '9px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14,
            background: result.ok ? '#ecfdf5' : '#fef2f2',
            color: result.ok ? '#065f46' : '#991b1b',
            border: `1px solid ${result.ok ? '#6ee7b7' : '#fca5a5'}` }}>
            {result.ok ? `✓ ${fmtNum(result.saved)} registros cargados.` : `✕ ${result.msg}`}
          </div>
        )}

        {/* Historial */}
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>
          Historial de cargas
        </div>
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
