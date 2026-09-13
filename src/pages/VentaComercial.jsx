import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { API } from '../App'
import { useAuth } from '../AuthContext'

const COLS = [
  'semana', 'agencia_id', 'canal', 'producto_id', 'fecha',
  'devolucion_piezas_anio_actual', 'devolucion_piezas_anio_anterior',
  'venta_bruta_piezas_anio_actual', 'venta_bruta_piezas_anio_anterior',
  'venta_neta_comercial_anio_actual', 'venta_neta_comercial_anio_anterior',
  'venta_bruta_piezas_presupuesto', 'venta_neta_comercial_presupuesto',
  'venta_bruta_presupuesto', 'venta_bruta_anio_actual', 'venta_bruta_anio_anterior',
]
const EJEMPLO = [
  '3', '20500', 'Detalle', '10001', '2026-01-19',
  '120', '110',
  '1000', '950',
  '25000', '23500',
  '1050', '26000',
  '27000', '26500', '25500',
]
const UPLOAD_URL  = '/api/venta-comercial/upload'
const BATCHES_URL = '/api/venta-comercial/batches'
const DELETE_URL  = '/api/venta-comercial/batches'

const REGLAS = [
  'Ninguna columna puede quedar vacía, excepto fecha, que puede ir en blanco.',
  'Los campos numéricos (devolucion_piezas_anio_actual, devolucion_piezas_anio_anterior, venta_bruta_piezas_anio_actual, venta_bruta_piezas_anio_anterior, venta_neta_comercial_anio_actual, venta_neta_comercial_anio_anterior, venta_bruta_piezas_presupuesto, venta_neta_comercial_presupuesto, venta_bruta_presupuesto, venta_bruta_anio_actual, venta_bruta_anio_anterior) deben ser números válidos.',
  'Si todos esos campos numéricos vienen en cero, la fila se descarta automáticamente y no se almacena (un valor distinto de cero, incluyendo negativos, evita que se descarte).',
  'No se permiten filas duplicadas por semana + agencia_id + canal + producto_id + fecha.',
  'Solo se cargan agencias (agencia_id) dentro del rango 20009–25769; las filas fuera de ese rango se descartan automáticamente y no se almacenan.',
  'El campo canal debe ser uno de: CONVENIENCIA, AUTOSERVICIOS, DETALLE, CANALES ESPECIALES o AUTOVEND. A partir de este valor se calcula y guarda automáticamente su código (Cod_canal: 574, 561, 560, 570 y 564 respectivamente); cualquier otro valor se rechaza.',
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
  a.href = url; a.download = 'plantilla_venta_comercial.csv'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const ROWS_COLS = [
  ['semana', 'semana'], ['agenciaId', 'agencia_id'], ['canal', 'canal'], ['codCanal', 'cod_canal'], ['productoId', 'producto_id'],
  ['fecha', 'fecha'],
  ['devolucionPiezasAnioActual', 'devolucion_piezas_anio_actual'],
  ['devolucionPiezasAnioAnterior', 'devolucion_piezas_anio_anterior'],
  ['ventaBrutaPiezasAnioActual', 'venta_bruta_piezas_anio_actual'],
  ['ventaBrutaPiezasAnioAnterior', 'venta_bruta_piezas_anio_anterior'],
  ['ventaNetaComercialAnioActual', 'venta_neta_comercial_anio_actual'],
  ['ventaNetaComercialAnioAnterior', 'venta_neta_comercial_anio_anterior'],
  ['ventaBrutaPiezasPresupuesto', 'venta_bruta_piezas_presupuesto'],
  ['ventaNetaComercialPresupuesto', 'venta_neta_comercial_presupuesto'],
  ['ventaBrutaPresupuesto', 'venta_bruta_presupuesto'],
  ['ventaBrutaAnioActual', 'venta_bruta_anio_actual'],
  ['ventaBrutaAnioAnterior', 'venta_bruta_anio_anterior'],
]

async function exportarBatchExcel(batchId, nombreArchivo) {
  const r = await fetch(`${API}${BATCHES_URL}/${batchId}/rows`)
  if (!r.ok) throw new Error(`No se pudieron obtener los registros (HTTP ${r.status}).`)
  const rows = await r.json()

  // Import diferido: ExcelJS pesa ~900kb minificado, solo se carga al exportar.
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Venta Comercial', { views: [{ state: 'frozen', ySplit: 1 }] })

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
  a.href = url; a.download = `${(nombreArchivo || 'venta_comercial').replace(/\.csv$/i, '')}.xlsx`
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

export default function VentaComercial() {
  const { usuario } = useAuth()
  const [file, setFile]         = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
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

  async function doUpload() {
    setConfirmState(null)
    setUploading(true); setResult(null)
    const form = new FormData()
    form.append('file', file)
    form.append('usuario', usuario?.nombreCompleto || '')
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
            Venta Comercial
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

          <button className="btn primary" onClick={handleUploadClick} disabled={!file || uploading}
            style={{ padding: '8px 24px', fontWeight: 700, fontSize: 13 }}>
            {uploading ? '⏳ Cargando…' : '↑ Cargar archivo'}
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
