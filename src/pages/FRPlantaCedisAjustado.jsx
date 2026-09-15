import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { API } from '../App'
import { useAuth } from '../AuthContext'

const COLS = [
  'Order Nbr', 'Item Code', 'Item Description', 'Cust Field 3', 'Ordered Qty', 'Orig Order Qty',
  'Allocated Qty', 'Packed Qty', 'Sale Price', 'Customer PO Nbr', 'Order Status', 'Order Type',
  'Required Ship Date', 'Cust Name', 'Order Date', 'Ship Date', 'Destination Facility', 'Facility',
  'orderdtlstatus', 'Estado', 'Semana',
]
const EJEMPLO = [
  '4245006', '204698', 'Hotkis Cajeta 1p 38g GRNL BIM', 'MTA', '0', '1',
  '0', '0', '492', 'PRUEBA', 'Cancelado', 'CEVE_MANUAL',
  '12/02/2026', '', '06/02/2026', '13/02/2026', 'BIM205', 'AIE',
  'Cancelled', 'Cerrado', '7',
]
const UPLOAD_URL  = '/api/fr-planta-cedis-ajustado/upload'
const BATCHES_URL = '/api/fr-planta-cedis-ajustado/batches'
const DELETE_URL  = '/api/fr-planta-cedis-ajustado/batches'

const REGLAS = [
  'No hay validación de contenido ni de duplicados: el archivo se carga tal cual viene.',
  'Solo se valida que el encabezado coincida con las 21 columnas esperadas (si no coincide, se rechaza la carga completa).',
  'Una fila con menos columnas de las esperadas se omite en silencio, sin rechazar el resto del archivo.',
  'Los campos numéricos y de fecha se guardan con su tipo real; si un valor puntual no se puede convertir, esa columna se guarda vacía sin afectar el resto de la fila (se acepta formato moneda para números).',
  'Se calcula automáticamente una columna "Cod_CeVe", encadenando dos búsquedas: 1) Destination Facility se busca en HW del catálogo Oracle de Destination Facility para obtener su Planta (si Destination Facility viene vacío, se usa Cust Name como CeVe en su lugar; los ceros a la izquierda no afectan la búsqueda); 2) ese valor se busca en CeveCPT del catálogo de CeVes Oracle para obtener su Bd, que es el resultado final. Si algún paso de la cadena no encuentra coincidencia, la columna queda vacía.',
]

function fmtDT(val) {
  if (!val) return '—'
  return new Date(val).toLocaleString('es-MX', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Mexico_City',
  }) + ' CDMX'
}
function fmtNum(n) { return n == null ? '—' : n.toLocaleString('es-MX') }
function fmtDur(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function descargarPlantilla() {
  const csv = `${COLS.join(',')}\n${EJEMPLO.join(',')}\n`
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'plantilla_fr_planta_cedis_ajustado.csv'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const ROWS_COLS = [
  ['orderNbr', 'Order Nbr'], ['itemCode', 'Item Code'], ['itemDescription', 'Item Description'],
  ['custField3', 'Cust Field 3'], ['orderedQty', 'Ordered Qty'], ['origOrderQty', 'Orig Order Qty'],
  ['allocatedQty', 'Allocated Qty'], ['packedQty', 'Packed Qty'], ['salePrice', 'Sale Price'],
  ['customerPoNbr', 'Customer PO Nbr'], ['orderStatus', 'Order Status'], ['orderType', 'Order Type'],
  ['requiredShipDate', 'Required Ship Date'], ['custName', 'Cust Name'], ['orderDate', 'Order Date'],
  ['shipDate', 'Ship Date'], ['destinationFacility', 'Destination Facility'], ['facility', 'Facility'],
  ['orderDtlStatus', 'orderdtlstatus'], ['estado', 'Estado'], ['semana', 'Semana'],
  ['codCeve', 'Cod_CeVe'],
]

async function exportarBatchExcel(batchId, nombreArchivo) {
  const r = await fetch(`${API}${BATCHES_URL}/${batchId}/rows`)
  if (!r.ok) throw new Error(`No se pudieron obtener los registros (HTTP ${r.status}).`)
  const rows = await r.json()

  // Import diferido: ExcelJS pesa ~900kb minificado, solo se carga al exportar.
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('FR Planta Cedis Ajustado', { views: [{ state: 'frozen', ySplit: 1 }] })

  const headerRow = ws.addRow(ROWS_COLS.map(([, label]) => label))
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
    cell.font = { bold: true, color: { argb: 'FF3730A3' } }
  })
  for (const row of rows) ws.addRow(ROWS_COLS.map(([key]) => row[key]))
  ws.columns.forEach(col => { col.width = 16 })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${(nombreArchivo || 'fr_planta_cedis_ajustado').replace(/\.csv$/i, '')}.xlsx`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const card = { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }
const cardTitle = { fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }

function ResultAlert({ result, onClose }) {
  if (!result) return null
  const ok = result.ok
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(15,23,42,0.25)', overflow: 'hidden',
      }}>
        <div style={{ padding: '24px 24px 16px', textAlign: 'center' }}>
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
            {ok
              ? <CheckCircle2 size={40} strokeWidth={1.75} color="#16a34a" />
              : <XCircle size={40} strokeWidth={1.75} color="#dc2626" />}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: ok ? '#065f46' : '#991b1b' }}>
            {ok ? 'Carga exitosa' : 'Carga negada'}
          </div>
          <div style={{ fontSize: 13, color: '#4b5563', marginTop: 6 }}>
            {ok ? `${fmtNum(result.saved)} registros cargados.` : result.msg}
          </div>
        </div>

        {!ok && result.errores?.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', background: '#fef2f2', padding: '14px 24px', overflowY: 'auto' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase',
              letterSpacing: '0.04em', marginBottom: 8, textAlign: 'center' }}>
              {result.errores.length} {result.errores.length === 1 ? 'error encontrado' : 'errores encontrados'}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#7f1d1d', lineHeight: 1.7 }}>
              {result.errores.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        )}

        <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <button className="btn primary" onClick={onClose} style={{ padding: '8px 28px', fontWeight: 700 }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ confirmState, onCancel }) {
  if (!confirmState) return null
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 400,
        boxShadow: '0 20px 50px rgba(15,23,42,0.25)', overflow: 'hidden',
      }}>
        <div style={{ padding: '28px 24px 20px', textAlign: 'center' }}>
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
            <HelpCircle size={32} strokeWidth={1.75} color="#2563eb" />
          </div>
          <div style={{ fontSize: 13, color: '#4b5563' }}>{confirmState.message}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: '0 24px 24px' }}>
          <button className="btn" onClick={onCancel} style={{ padding: '8px 22px', fontWeight: 600 }}>
            Cancelar
          </button>
          <button className="btn primary" onClick={confirmState.onConfirm} style={{ padding: '8px 22px', fontWeight: 700 }}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FRPlantaCedisAjustado() {
  const { usuario } = useAuth()
  const [file, setFile]         = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(null)
  const [result, setResult]     = useState(null)
  const [batches, setBatches]   = useState([])
  const [loadingB, setLoadingB] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [exporting, setExporting] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
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

  function handleUploadClick() {
    if (!file) return
    setConfirmState({ message: `¿Cargar "${file.name}"?`, onConfirm: doUpload })
  }

  // El archivo puede ser grande -- un solo POST se pasa del timeout de request
  // de Azure aunque el servidor procese rápido, así que se sube en trozos.
  const CHUNK_SIZE = 32 * 1024 * 1024
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

  async function doUpload() {
    setConfirmState(null)
    setUploading(true); setResult(null); setUploadPct(0)
    try {
      const usuarioNombre = usuario?.nombreCompleto || ''
      const initR = await fetchWithRetry(
        `${API}${UPLOAD_URL}/init?fileName=${encodeURIComponent(file.name)}&usuario=${encodeURIComponent(usuarioNombre)}`,
        { method: 'POST' })
      if (!initR.ok) throw new Error(`HTTP ${initR.status} al iniciar la subida`)
      const { uploadId } = await initR.json()

      for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
        const chunk = file.slice(offset, offset + CHUNK_SIZE)
        const r = await fetchWithRetry(`${API}${UPLOAD_URL}/chunk?uploadId=${uploadId}&expectedOffset=${offset}`, {
          method: 'POST', body: chunk,
        })
        if (!r.ok) throw new Error(`HTTP ${r.status} al subir el archivo (byte ${offset})`)
        setUploadPct(Math.round(Math.min(offset + CHUNK_SIZE, file.size) / file.size * 100))
      }

      const compR = await fetchWithRetry(`${API}${UPLOAD_URL}/complete?uploadId=${uploadId}`, { method: 'POST' })
      const text = await compR.text()
      const d = text ? JSON.parse(text) : {}
      if (!compR.ok) {
        setResult({ ok: false, msg: d.error || `HTTP ${compR.status}`, errores: d.errores ?? [] })
        return
      }
      setResult({ ok: true, saved: d.saved })
      setFile(null)
      await loadBatches()
    } catch (e) {
      setResult({ ok: false, msg: e.message, errores: [] })
    } finally { setUploading(false); setUploadPct(null) }
  }

  function handleDeleteClick(batchId, nombre) {
    setConfirmState({ message: `¿Eliminar la carga "${nombre}"?`, onConfirm: () => doDelete(batchId) })
  }

  async function doDelete(batchId) {
    setConfirmState(null)
    setDeleting(batchId)
    try {
      await fetch(`${API}${DELETE_URL}/${batchId}`, { method: 'DELETE' })
      await loadBatches()
    } finally { setDeleting(null) }
  }

  async function handleExport(batchId, nombreArchivo) {
    setExporting(batchId)
    try {
      await exportarBatchExcel(batchId, nombreArchivo)
    } catch (e) {
      alert('No se pudo exportar: ' + e.message)
    } finally { setExporting(null) }
  }

  return (
    <div style={{ padding: '24px 28px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            FR Planta/Cedis Ajustado
          </h1>
        </div>
        <button className="btn" onClick={descargarPlantilla} style={{ fontSize: 12.5 }}>
          ⬇ Descargar plantilla CSV
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 560px) 1fr', gap: 16, alignItems: 'start' }}>
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
                    <td key={i} style={{ padding: '5px 8px', color: '#6b7280' }}>{v || '—'}</td>
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

          <button className="btn primary" onClick={handleUploadClick} disabled={!file || uploading}
            style={{ padding: '8px 24px', fontWeight: 700, fontSize: 13 }}>
            {uploading
              ? (uploadPct != null ? `⏳ Subiendo… ${uploadPct}%` : '⏳ Procesando…')
              : '↑ Cargar archivo'}
          </button>
        </div>
      </div>

      <ResultAlert result={result} onClose={() => setResult(null)} />
      <ConfirmModal confirmState={confirmState} onCancel={() => setConfirmState(null)} />

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
                  {['Archivo', 'Registros', 'Usuario', 'Cargado el', 'Tiempo de proceso', ''].map(h => (
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
                    <td style={{ padding: '8px 14px' }}>{b.usuario || '—'}</td>
                    <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>{fmtDT(b.cargadoEn)}</td>
                    <td style={{ padding: '8px 14px' }}>{fmtDur(b.duracionMs)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn" onClick={() => handleExport(b.batchId, b.nombreArchivo)}
                        disabled={exporting === b.batchId}
                        style={{ fontSize: 12, padding: '3px 10px', marginRight: 6 }}>
                        {exporting === b.batchId ? '…' : '⬇ Exportar Excel'}
                      </button>
                      <button className="btn" onClick={() => handleDeleteClick(b.batchId, b.nombreArchivo)}
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
