import { useState, useEffect, useRef } from 'react'
import { API } from '../App'

function fmtDur(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
function fmtNum(n) { return n == null ? '—' : n.toLocaleString('es-MX') }

const CSV_COLS = [
  'Cod_CeVe','Nombre_CeVe','Item','Nombre Producto','Día',
  'Promedio Final Pedido','Desviacion_std_Pedido','Pedido_mas_Desviacion',
  'Promedio Final Carga','Desviacion_std_Carga','Carga_mas_Desviacion',
]

export default function PedidoVendedorPromedios() {
  const [running, setRunning]     = useState(false)
  const [estado, setEstado]       = useState(null)
  const [result, setResult]       = useState(null)
  const [batches, setBatches]     = useState([])
  const [loadingB, setLoadingB]   = useState(true)
  const [deleting, setDeleting]   = useState(null)
  const [file, setFile]           = useState(null)
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [uploadingBatchId, setUploadingBatchId] = useState(null)
  const [uploadPct, setUploadPct] = useState(null)
  const pollRef = useRef(null)
  const uploadPollRef = useRef(null)
  const deletePollRef = useRef(null)
  const inputRef = useRef(null)

  async function loadBatches() {
    setLoadingB(true)
    try {
      const r = await fetch(`${API}/api/pedido-vendedor-promedios/batches`)
      if (r.ok) setBatches(await r.json())
    } catch {}
    finally { setLoadingB(false) }
  }

  async function checkEstado() {
    try {
      const r = await fetch(`${API}/api/pedido-vendedor-promedios/estado`)
      if (!r.ok) return
      const d = await r.json()
      setEstado(d)
      if (d.estado === 'completado' || d.estado === 'error') {
        clearInterval(pollRef.current)
        setRunning(false)
        if (d.estado === 'completado') setResult({ ok: true, d: d.resultado })
        else setResult({ ok: false, msg: d.error })
        loadBatches()
      }
    } catch {}
  }

  useEffect(() => {
    checkEstado().then(() => {
      setEstado(prev => {
        if (prev?.estado === 'ejecutando') {
          setRunning(true)
          pollRef.current = setInterval(checkEstado, 3000)
        }
        return prev
      })
    })
    // Si había una carga CSV en curso (p.ej. tras recargar la página), retoma el polling
    fetch(`${API}/api/pedido-vendedor-promedios/batches`).then(r => r.ok ? r.json() : []).then(list => {
      setBatches(list)
      setLoadingB(false)
      const enCurso = list.find(b => b.origen === 'CSV' && b.estado === 'ejecutando')
      if (enCurso) {
        setUploading(true)
        setUploadingBatchId(enCurso.batchId)
        uploadPollRef.current = setInterval(() => checkUploadBatch(enCurso.batchId), 3000)
      }
      // Si había un borrado en curso (p.ej. tras recargar la página), retoma el polling
      const eliminando = list.find(b => b.estado === 'eliminando')
      if (eliminando) {
        setDeleting(eliminando.batchId)
        deletePollRef.current = setInterval(() => checkDeleteBatch(eliminando.batchId), 3000)
      }
    }).catch(() => setLoadingB(false))
    return () => { clearInterval(pollRef.current); clearInterval(uploadPollRef.current); clearInterval(deletePollRef.current) }
  }, [])

  async function checkDeleteBatch(batchId) {
    try {
      const r = await fetch(`${API}/api/pedido-vendedor-promedios/batches`)
      if (!r.ok) return
      const list = await r.json()
      setBatches(list)
      if (!list.find(b => b.batchId === batchId)) {
        // ya no aparece en la lista → se terminó de borrar
        clearInterval(deletePollRef.current)
        setDeleting(null)
      }
    } catch {}
  }

  async function checkUploadBatch(batchId) {
    try {
      const r = await fetch(`${API}/api/pedido-vendedor-promedios/batches`)
      if (!r.ok) return
      const list = await r.json()
      setBatches(list)
      const b = list.find(x => x.batchId === batchId)
      if (b && (b.estado === 'OK' || b.estado === 'ERROR')) {
        clearInterval(uploadPollRef.current)
        setUploading(false)
        setUploadingBatchId(null)
        if (b.estado === 'OK') setUploadResult({ ok: true, saved: b.totalFilas })
        else setUploadResult({ ok: false, msg: b.detalle || 'Error al procesar el archivo.' })
      }
    } catch {}
  }

  async function handleEjecutar() {
    if (!confirm('¿Ejecutar el proceso contra Synapse? Son más de 8 millones de registros — puede tardar bastante y reemplazará la corrida anterior del proceso (no afecta cargas CSV).')) return
    setRunning(true); setResult(null)
    try {
      const r = await fetch(`${API}/api/pedido-vendedor-promedios/ejecutar`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`)
      pollRef.current = setInterval(checkEstado, 3000)
    } catch (e) {
      setRunning(false)
      setResult({ ok: false, msg: e.message })
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.toLowerCase().endsWith('.csv')) setFile(f)
    else alert('Solo se aceptan archivos .csv')
  }

  const CHUNK_SIZE = 32 * 1024 * 1024 // 32MB por request — un solo POST con el CSV completo
                                      // (puede pesar GBs) se pasa del timeout de Azure aunque
                                      // el servidor procese rápido, así que se sube en pedazos.
                                      // 32MB (en vez de menos) mantiene bajo el número total de
                                      // requests, ya que la red es algo inestable y cada request
                                      // extra es una oportunidad más de toparse con un corte.
  const MAX_RETRIES = 4

  async function fetchWithRetry(url, opts) {
    let lastErr
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fetch(url, opts)
      } catch (e) {
        lastErr = e
        if (attempt < MAX_RETRIES) await new Promise(res => setTimeout(res, 1000 * attempt))
      }
    }
    throw lastErr
  }

  async function handleUpload() {
    if (!file) return
    if (!confirm(`¿Cargar "${file.name}"?`)) return
    setUploading(true); setUploadResult(null); setUploadPct(0)
    try {
      const initR = await fetchWithRetry(`${API}/api/pedido-vendedor-promedios/upload/init?fileName=${encodeURIComponent(file.name)}`, { method: 'POST' })
      if (!initR.ok) throw new Error(`HTTP ${initR.status} al iniciar la subida`)
      const { uploadId } = await initR.json()

      for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
        const chunk = file.slice(offset, offset + CHUNK_SIZE)
        // expectedOffset le permite al servidor truncar y reintentar de forma segura si un
        // intento previo de este mismo chunk se cortó a medias (ver fetchWithRetry).
        const r = await fetchWithRetry(`${API}/api/pedido-vendedor-promedios/upload/chunk?uploadId=${uploadId}&expectedOffset=${offset}`, {
          method: 'POST', body: chunk,
        })
        if (!r.ok) throw new Error(`HTTP ${r.status} al subir el archivo (byte ${offset})`)
        setUploadPct(Math.round(Math.min(offset + CHUNK_SIZE, file.size) / file.size * 100))
      }

      const compR = await fetchWithRetry(`${API}/api/pedido-vendedor-promedios/upload/complete?uploadId=${uploadId}`, { method: 'POST' })
      const text = await compR.text()
      const d = text ? JSON.parse(text) : {}
      if (!compR.ok) throw new Error(d.detail || d.error || `HTTP ${compR.status}`)

      setFile(null)
      setUploadPct(null)
      setUploadingBatchId(d.batchId)
      await loadBatches()
      uploadPollRef.current = setInterval(() => checkUploadBatch(d.batchId), 3000)
    } catch (e) {
      setUploading(false)
      setUploadPct(null)
      setUploadResult({ ok: false, msg: `${e.message} (reintentó ${MAX_RETRIES} veces por request antes de rendirse — probablemente un corte de red; intenta de nuevo)` })
    }
  }

  async function handleDelete(batchId, label) {
    if (!confirm(`¿Eliminar el lote "${label}"? Esto borra sus filas de la tabla de resultados. Si el lote es grande puede tardar varios minutos.`)) return
    setDeleting(batchId)
    try {
      const r = await fetch(`${API}/api/pedido-vendedor-promedios/batches/${batchId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await loadBatches()
      deletePollRef.current = setInterval(() => checkDeleteBatch(batchId), 3000)
    } catch (e) {
      setDeleting(null)
      alert(`No se pudo iniciar la eliminación: ${e.message}`)
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
          Promedios de Pedido
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
          Promedio final y desviación estándar de pedido y carga por CeVe, Item y Día.
        </p>
      </div>

      {/* Ejecutar proceso */}
      <div style={{
        background: '#f8faff', border: '1px solid #c7d7fd', borderRadius: 14,
        padding: '22px 24px', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e3a8a' }}>
              Ejecutar proceso contra Synapse
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              Fuente: cbbmdnasyncd03.sql.azuresynapse.net — más de 8 millones de registros. Cada ejecución reemplaza la corrida anterior del proceso.
            </div>
          </div>
          <button className="btn primary" onClick={handleEjecutar} disabled={running}
            style={{ padding: '9px 28px', fontWeight: 700, fontSize: 14, height: 38 }}>
            {running ? '⏳ Ejecutando…' : '▶ Ejecutar proceso'}
          </button>
        </div>

        {running && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}>
            ⏳ Procesando… {fmtNum(estado?.filasProcesadas)} registros guardados hasta ahora. Esto puede tardar varios minutos.
          </div>
        )}

        {result && !running && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: result.ok ? '#ecfdf5' : '#fef2f2',
            color:      result.ok ? '#065f46'  : '#991b1b',
            border: `1px solid ${result.ok ? '#6ee7b7' : '#fca5a5'}`,
          }}>
            {result.ok
              ? `✓ Proceso completado — ${fmtNum(result.d?.totalFilas)} registros en ${fmtDur(result.d?.duracionMs)}`
              : `✕ ${result.msg}`}
          </div>
        )}
      </div>

      {/* Carga manual CSV */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '20px 22px', marginBottom: 24,
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 10 }}>
          O carga el resultado manualmente (CSV)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {CSV_COLS.map((c, i) => (
            <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99,
              background: '#e0e7ff', color: '#3730a3', fontFamily: 'monospace' }}>{c}</span>
          ))}
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !file && inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#3b82f6' : file ? '#22c55e' : '#93c5fd'}`,
            borderRadius: 10, padding: '22px 20px', textAlign: 'center',
            cursor: file ? 'default' : 'pointer',
            background: dragging ? '#eff6ff' : file ? '#f0fdf4' : 'transparent',
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

        <button className="btn primary" onClick={handleUpload} disabled={!file || uploading}
          style={{ padding: '8px 24px', fontWeight: 700, fontSize: 13 }}>
          {uploading ? (uploadPct != null ? `⏳ Subiendo… ${uploadPct}%` : '⏳ Procesando…') : '↑ Cargar archivo'}
        </button>

        {uploading && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}>
            {uploadPct != null
              ? `⏳ Subiendo archivo… ${uploadPct}%`
              : `⏳ ${fmtNum(batches.find(b => b.batchId === uploadingBatchId)?.filasProcesadas)} registros procesados hasta ahora…`}
          </div>
        )}

        {uploadResult && !uploading && (
          <div style={{ marginTop: 14, padding: '9px 14px', borderRadius: 8, fontSize: 13,
            background: uploadResult.ok ? '#ecfdf5' : '#fef2f2',
            color: uploadResult.ok ? '#065f46' : '#991b1b',
            border: `1px solid ${uploadResult.ok ? '#6ee7b7' : '#fca5a5'}` }}>
            {uploadResult.ok ? `✓ ${fmtNum(uploadResult.saved)} registros cargados.` : `✕ ${uploadResult.msg}`}
          </div>
        )}
      </div>

      {/* Historial de lotes */}
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 12 }}>
        Historial de lotes
      </div>
      {loadingB ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Cargando…</div>
      ) : batches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 28 }}>
          Sin lotes registrados aún.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 28 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Origen','Archivo','Registros','Duración','Cargado el','Estado',''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600,
                    color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((b, i) => {
                const enCurso = b.estado === 'ejecutando'
                const eliminando = b.estado === 'eliminando'
                return (
                  <tr key={b.batchId} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 600 }}>{b.origen}</td>
                    <td style={{ padding: '8px 14px' }}>{b.nombreArchivo ?? '—'}</td>
                    <td style={{ padding: '8px 14px', fontWeight: 600 }}>
                      {eliminando ? `${fmtNum(b.filasProcesadas)} borradas…` : enCurso ? `${fmtNum(b.filasProcesadas)}…` : fmtNum(b.totalFilas)}
                    </td>
                    <td style={{ padding: '8px 14px' }}>{fmtDur(b.duracionMs)}</td>
                    <td style={{ padding: '8px 14px' }}>{new Date(b.cargadoEn).toLocaleString('es-MX')}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                        background: b.estado === 'OK' ? '#dcfce7' : (enCurso || eliminando) ? '#dbeafe' : '#fef2f2',
                        color:      b.estado === 'OK' ? '#166534' : (enCurso || eliminando) ? '#1d4ed8' : '#991b1b',
                      }} title={b.detalle ?? ''}>{b.estado}</span>
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                      <button className="btn" onClick={() => handleDelete(b.batchId, b.nombreArchivo ?? b.origen)}
                        disabled={deleting === b.batchId || enCurso || eliminando}
                        style={{ fontSize: 12, padding: '3px 10px', color: '#dc2626', borderColor: '#fca5a5' }}>
                        {(deleting === b.batchId || eliminando) ? '⏳ Eliminando…' : '🗑 Eliminar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
