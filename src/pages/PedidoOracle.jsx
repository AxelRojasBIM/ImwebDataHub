import { useState, useEffect, useRef } from 'react'
import { API } from '../App'

function fmtDT(val) {
  if (!val) return '—'
  return new Date(val).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' })
}

function fmtDur(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`
}

function fmtNum(n) { return n == null ? '—' : n.toLocaleString('es-MX') }

const COLS = [
  'Order Nbr','Item Code','Item Description','Cust Field 3',
  'Ordered Qty','Orig Order Qty','Allocated Qty','Packed Qty','Sale Price',
  'Customer PC','Order Status','Order Type','Required Ship Date','Cust Name',
  'Order Date','Ship Date','Destination ID','Facility','OrderDtl Status','Estado','Semana',
]

export default function PedidoOracle() {
  const [file, setFile]         = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult]     = useState(null)
  const [batches, setBatches]   = useState([])
  const [loadingB, setLoadingB] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const inputRef = useRef(null)

  async function loadBatches() {
    setLoadingB(true)
    try {
      const r = await fetch(`${API}/api/pedido-oracle/batches`)
      if (r.ok) setBatches(await r.json())
    } catch {}
    finally { setLoadingB(false) }
  }

  useEffect(() => { loadBatches() }, [])

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith('.csv') || f.name.endsWith('.CSV'))) setFile(f)
    else alert('Solo se aceptan archivos .csv')
  }

  async function handleUpload() {
    if (!file) return
    if (!confirm(`¿Cargar "${file.name}"?\n${(file.size/1024/1024).toFixed(1)} MB`)) return
    setUploading(true); setResult(null); setProgress('Subiendo archivo…')

    const form = new FormData()
    form.append('file', file)

    try {
      const r = await fetch(`${API}/api/pedido-oracle/upload`, { method:'POST', body: form })
      setProgress('Procesando…')
      const text = await r.text()
      const d = text ? JSON.parse(text) : {}
      if (!r.ok) throw new Error(d.detail || d.error || d.title || `HTTP ${r.status}`)
      setResult({ ok:true, d })
      setFile(null)
      await loadBatches()
    } catch(e) {
      setResult({ ok:false, msg: e.message })
    } finally { setUploading(false); setProgress(null) }
  }

  async function handleDelete(batchId, nombre) {
    if (!confirm(`¿Eliminar la carga "${nombre}"? Se borrarán todos sus registros.`)) return
    setDeleting(batchId)
    try {
      await fetch(`${API}/api/pedido-oracle/batches/${batchId}`, { method:'DELETE' })
      await loadBatches()
    } finally { setDeleting(null) }
  }

  const sizeMB = file ? (file.size / 1024 / 1024).toFixed(1) : null

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'28px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0, color:'var(--text)' }}>Pedido Oracle</h1>
        <p style={{ margin:'6px 0 0', fontSize:13, color:'#6b7280' }}>
          Carga archivos CSV exportados de Oracle con la estructura de pedidos. Soporta +100,000 registros.
        </p>
      </div>

      {/* Zona de carga */}
      <div style={{ background:'#f8faff', border:'1px solid #c7d7fd', borderRadius:14, padding:'22px 24px', marginBottom:28 }}>
        <div style={{ fontWeight:700, fontSize:14, color:'#1e3a8a', marginBottom:14 }}>
          Subir archivo CSV
        </div>

        {/* Columnas esperadas */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
          {COLS.map((c,i) => (
            <span key={i} style={{ fontSize:11, padding:'2px 8px', borderRadius:99,
              background:'#e0e7ff', color:'#3730a3', fontFamily:'monospace' }}>{c}</span>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !file && inputRef.current?.click()}
          style={{
            border:`2px dashed ${dragging ? '#3b82f6' : file ? '#22c55e' : '#93c5fd'}`,
            borderRadius:10, padding:'28px 20px', textAlign:'center', cursor: file ? 'default' : 'pointer',
            background: dragging ? '#eff6ff' : file ? '#f0fdf4' : '#fff',
            transition:'all .15s',
          }}
        >
          <input ref={inputRef} type="file" accept=".csv" style={{ display:'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value='' }} />

          {file ? (
            <div>
              <div style={{ fontSize:28, marginBottom:6 }}>📄</div>
              <div style={{ fontWeight:700, color:'#15803d', fontSize:14 }}>{file.name}</div>
              <div style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>{sizeMB} MB</div>
              <button onClick={e => { e.stopPropagation(); setFile(null) }}
                style={{ marginTop:10, fontSize:12, padding:'4px 12px', borderRadius:6,
                  border:'1px solid #d1d5db', background:'#fff', cursor:'pointer', color:'#374151' }}>
                ✕ Quitar
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:32, marginBottom:8 }}>☁</div>
              <div style={{ fontWeight:600, color:'#374151', fontSize:14 }}>
                Arrastra el CSV aquí o <span style={{ color:'#2563eb' }}>haz clic para seleccionar</span>
              </div>
              <div style={{ fontSize:12, color:'#9ca3af', marginTop:4 }}>Solo archivos .csv</div>
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:12, marginTop:16, alignItems:'center' }}>
          <button className="btn primary" onClick={handleUpload}
            disabled={!file || uploading}
            style={{ padding:'9px 28px', fontWeight:700, fontSize:14 }}>
            {uploading ? `⏳ ${progress || 'Procesando…'}` : '↑ Cargar archivo'}
          </button>
          {uploading && (
            <span style={{ fontSize:13, color:'#6b7280' }}>
              Los archivos grandes pueden tardar varios minutos…
            </span>
          )}
        </div>

        {result && (
          <div style={{ marginTop:14, padding:'10px 14px', borderRadius:8, fontSize:13,
            background: result.ok ? '#ecfdf5' : '#fef2f2',
            color:      result.ok ? '#065f46'  : '#991b1b',
            border:`1px solid ${result.ok ? '#6ee7b7' : '#fca5a5'}` }}>
            {result.ok
              ? `✓ ${fmtNum(result.d.saved)} registros cargados correctamente.`
              : `✕ ${result.msg}`}
          </div>
        )}
      </div>

      {/* Historial de cargas */}
      <div style={{ fontWeight:700, fontSize:15, color:'var(--text)', marginBottom:12 }}>
        Historial de cargas
      </div>

      {loadingB ? (
        <div style={{ color:'#9ca3af', fontSize:13 }}>Cargando historial…</div>
      ) : batches.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:'#9ca3af', fontSize:14,
          border:'1px dashed var(--border)', borderRadius:12 }}>
          Sin cargas registradas aún.
        </div>
      ) : (
        <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid var(--border)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#f9fafb' }}>
                {['Archivo','Registros','Cargado el','Duración',''].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:600,
                    color:'#374151', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((b, i) => (
                <tr key={b.batchId} style={{ borderBottom:'1px solid var(--border)', background: i%2===0?'#fff':'#fafafa' }}>
                  <td style={{ padding:'9px 14px', maxWidth:320, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    <span title={b.batchId} style={{ fontFamily:'monospace', fontSize:11, color:'#9ca3af', marginRight:8 }}>
                      {b.batchId.slice(0,8)}…
                    </span>
                    {b.nombreArchivo}
                  </td>
                  <td style={{ padding:'9px 14px', fontWeight:600 }}>{fmtNum(b.totalFilas)}</td>
                  <td style={{ padding:'9px 14px' }}>{fmtDT(b.cargadoEn)}</td>
                  <td style={{ padding:'9px 14px' }}>{fmtDur(b.duracionMs)}</td>
                  <td style={{ padding:'9px 14px', textAlign:'right' }}>
                    <button className="btn" onClick={() => handleDelete(b.batchId, b.nombreArchivo)}
                      disabled={deleting === b.batchId}
                      style={{ fontSize:12, padding:'4px 12px', color:'#dc2626', borderColor:'#fca5a5' }}>
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
  )
}
