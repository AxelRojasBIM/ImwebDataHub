import { useState, useEffect, useRef, Fragment } from 'react'
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { API } from '../App'
import { useAuth } from '../AuthContext'

const COLS = [
  'anio', 'semana', 'numero_cido', 'plan_comercial', 'tipo_iniciativa', 'semana_inicio', 'semana_fin',
  'canal', 'region', 'gerencia', 'cod_ceve', 'item', 'producto', 'categoria', 'marca',
  'meta_pzs', 'meta_importe', 'meta_dist',
]
const EJEMPLO = [
  '2026', '3', 'CIDO-231-2026', 'PlanQ1', 'Lanzamiento', '3', '6', 'Detalle', 'Centro', 'Gerencia Centro', '20279',
  '12345', 'Pan Blanco Grande', 'Panes', 'Bimbo', '1000', '18500.00', '50',
]
const UPLOAD_URL  = '/api/planes-comerciales/upload'
const BATCHES_URL = '/api/planes-comerciales/batches'
const DELETE_URL  = '/api/planes-comerciales/batches'

const REGLAS = [
  'Ninguna columna puede quedar vacía, excepto \'meta_importe\' y \'meta_dist\', que pueden ir en blanco.',
  '\'meta_pzs\' debe ser mayor a cero. \'meta_importe\' y \'meta_dist\' pueden ser 0 o quedar vacío/nulo.',
  'No se permiten filas duplicadas por anio + semana + numero_cido + canal + cod_ceve + item.',
  'Cada fila cargada se guarda automáticamente con Estatus "Activo" (no es una columna del CSV).',
]

const TABS = [
  { id: 'cargar',      label: '📤 Cargar' },
  { id: 'administrar', label: '🗂 Administrar Planes' },
  { id: 'bitacora',    label: '📜 Bitácora' },
]

const ACCION_INFO = {
  carga:        { label: 'Carga',          bg: '#dbeafe', color: '#1d4ed8' },
  eliminacion:  { label: 'Eliminación',    bg: '#fee2e2', color: '#991b1b' },
  estatus_cido: { label: 'Estatus (CIDO)', bg: '#ede9fe', color: '#6d28d9' },
  estatus_fila: { label: 'Estatus (fila)', bg: '#e0e7ff', color: '#3730a3' },
}
function AccionBadge({ accion }) {
  const a = ACCION_INFO[accion] || { label: accion, bg: '#f3f4f6', color: '#374151' }
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
      background: a.bg, color: a.color, whiteSpace: 'nowrap' }}>
      {a.label}
    </span>
  )
}

const ESTATUS_OPTIONS = ['Activo', 'Pausado', 'Cancelado']
const ESTATUS_STYLE = {
  Activo:    { bg: '#dcfce7', color: '#166534' },
  Pausado:   { bg: '#fef3c7', color: '#92400e' },
  Cancelado: { bg: '#fee2e2', color: '#991b1b' },
  Mixto:     { bg: '#e0e7ff', color: '#3730a3' },
}

function EstatusBadge({ estatus }) {
  const s = ESTATUS_STYLE[estatus] || { bg: '#f3f4f6', color: '#374151' }
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {estatus || '—'}
    </span>
  )
}

function EstatusSelector({ value, busy, onApply }) {
  const initial = ESTATUS_OPTIONS.includes(value) ? value : ESTATUS_OPTIONS[0]
  const [sel, setSel] = useState(initial)
  useEffect(() => { setSel(ESTATUS_OPTIONS.includes(value) ? value : ESTATUS_OPTIONS[0]) }, [value])
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select value={sel} onChange={e => setSel(e.target.value)} disabled={busy}
        style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff' }}>
        {ESTATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <button onClick={() => onApply(sel)} disabled={busy || sel === value}
        style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px solid #93b4fd', color: '#1d4ed8',
          background: 'none', cursor: (busy || sel === value) ? 'default' : 'pointer', opacity: (busy || sel === value) ? 0.5 : 1 }}>
        {busy ? '…' : 'Aplicar'}
      </button>
    </div>
  )
}

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
  a.href = url; a.download = 'plantilla_planes_comerciales.csv'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const ROWS_COLS = [
  ['anio', 'anio'], ['semana', 'semana'], ['numeroCido', 'numero_cido'], ['planComercial', 'plan_comercial'],
  ['tipoIniciativa', 'tipo_iniciativa'], ['semanaInicio', 'semana_inicio'], ['semanaFin', 'semana_fin'], ['canal', 'canal'],
  ['region', 'region'], ['gerencia', 'gerencia'], ['codCeve', 'cod_ceve'], ['item', 'item'],
  ['producto', 'producto'], ['categoria', 'categoria'], ['marca', 'marca'],
  ['metaPzs', 'meta_pzs'], ['metaImporte', 'meta_importe'], ['metaDist', 'meta_dist'], ['estatus', 'estatus'],
]

async function exportarBatchExcel(batchId, nombreArchivo) {
  const r = await fetch(`${API}${BATCHES_URL}/${batchId}/rows`)
  if (!r.ok) throw new Error(`No se pudieron obtener los registros (HTTP ${r.status}).`)
  const rows = await r.json()

  // Import diferido: ExcelJS pesa ~900kb minificado, solo se carga al exportar.
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Planes Comerciales', { views: [{ state: 'frozen', ySplit: 1 }] })

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
  a.href = url; a.download = `${(nombreArchivo || 'planes_comerciales').replace(/\.csv$/i, '')}.xlsx`
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

function TabCargar() {
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
  const [uploadPct, setUploadPct] = useState(null)
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

  // El archivo puede traer 500k+ filas (decenas/cientos de MB) -- un solo POST se
  // pasa del timeout de request de Azure aunque el servidor procese rápido, así
  // que se sube en trozos y solo hasta /complete se valida e inserta todo junto.
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
        if (!r.ok) {
          const t = await r.text().catch(() => '')
          let detail = ''
          try { detail = t ? JSON.parse(t).error : '' } catch { detail = t }
          throw new Error(`HTTP ${r.status} al subir el archivo (byte ${offset})${detail ? `: ${detail}` : ''}`)
        }
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
      const usuarioNombre = usuario?.nombreCompleto || ''
      await fetch(`${API}${DELETE_URL}/${batchId}?usuario=${encodeURIComponent(usuarioNombre)}`, { method: 'DELETE' })
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
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
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
    </>
  )
}

// ── Tab: Administrar Planes (filtrar por CIDO, ver contenido, cambiar Estatus) ──
function PlanDetalle({ data, loading, page, totalPages, busyRowId, onPageChange, onRowEstatus }) {
  if (loading && !data) return <div style={{ padding: 16, color: '#9ca3af', fontSize: 12.5 }}>Cargando filas…</div>
  if (!data || data.rows.length === 0) return <div style={{ padding: 16, color: '#9ca3af', fontSize: 12.5 }}>Sin filas.</div>
  return (
    <div style={{ paddingTop: 10 }}>
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              {['Semana', 'Canal', 'Región', 'Gerencia', 'CeVe', 'Item', 'Producto', 'Categoría', 'Marca',
                'Meta Pzs', 'Meta Importe', 'Meta Dist', 'Estatus', 'Cambiar a'].map(h => (
                <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600,
                  color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 10px' }}>{r.semana}</td>
                <td style={{ padding: '6px 10px' }}>{r.canal}</td>
                <td style={{ padding: '6px 10px' }}>{r.region}</td>
                <td style={{ padding: '6px 10px' }}>{r.gerencia}</td>
                <td style={{ padding: '6px 10px', fontWeight: 600 }}>{r.codCeve}</td>
                <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{r.item}</td>
                <td style={{ padding: '6px 10px' }}>{r.producto}</td>
                <td style={{ padding: '6px 10px' }}>{r.categoria}</td>
                <td style={{ padding: '6px 10px' }}>{r.marca}</td>
                <td style={{ padding: '6px 10px' }}>{fmtNum(r.metaPzs)}</td>
                <td style={{ padding: '6px 10px' }}>{r.metaImporte != null ? fmtNum(r.metaImporte) : '—'}</td>
                <td style={{ padding: '6px 10px' }}>{r.metaDist != null ? fmtNum(r.metaDist) : '—'}</td>
                <td style={{ padding: '6px 10px' }}><EstatusBadge estatus={r.estatus} /></td>
                <td style={{ padding: '6px 10px' }}>
                  <EstatusSelector value={r.estatus} busy={busyRowId === r.id} onApply={nuevo => onRowEstatus(r, nuevo)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'center' }}>
          <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
            style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11 }}>‹</button>
          <span style={{ padding: '3px 10px', fontSize: 11, color: '#6b7280' }}>Página {page} / {totalPages}</span>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
            style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11 }}>›</button>
        </div>
      )}
    </div>
  )
}

function TabAdministrar() {
  const { usuario } = useAuth()
  const PAGE_SIZE = 15
  const ROWS_PAGE_SIZE = 50

  const [search, setSearch] = useState('')
  const [searchInp, setSearchInp] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirmState, setConfirmState] = useState(null)
  const [busyCido, setBusyCido] = useState(null)
  const [msg, setMsg] = useState(null)

  const [expanded, setExpanded] = useState(null)
  const [rowsData, setRowsData] = useState(null)
  const [rowsPage, setRowsPage] = useState(1)
  const [loadingRows, setLoadingRows] = useState(false)
  const [busyRowId, setBusyRowId] = useState(null)

  async function load(p, s) {
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/planes-comerciales/planes?search=${encodeURIComponent(s)}&page=${p}&pageSize=${PAGE_SIZE}`)
      if (r.ok) setData(await r.json())
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load(1, '') }, [])

  function handleSearch(e) {
    e.preventDefault()
    setSearch(searchInp); setPage(1); setExpanded(null); setRowsData(null)
    load(1, searchInp)
  }

  function changePage(p) {
    setPage(p); setExpanded(null); setRowsData(null)
    load(p, search)
  }

  async function loadRows(numeroCido, p) {
    setLoadingRows(true)
    try {
      const r = await fetch(`${API}/api/planes-comerciales/planes/${encodeURIComponent(numeroCido)}/rows?page=${p}&pageSize=${ROWS_PAGE_SIZE}`)
      if (r.ok) setRowsData(await r.json())
    } catch {} finally { setLoadingRows(false) }
  }

  function toggleExpand(numeroCido) {
    if (expanded === numeroCido) { setExpanded(null); setRowsData(null); return }
    setExpanded(numeroCido); setRowsPage(1); setRowsData(null); loadRows(numeroCido, 1)
  }

  function handleBulkEstatus(plan, nuevo) {
    setConfirmState({
      message: `¿Cambiar el estatus de TODO el plan ${plan.numeroCido} (${fmtNum(plan.totalFilas)} filas) a "${nuevo}"?`,
      onConfirm: () => doBulkEstatus(plan, nuevo),
    })
  }

  async function doBulkEstatus(plan, nuevo) {
    setConfirmState(null)
    setBusyCido(plan.numeroCido)
    try {
      const r = await fetch(`${API}/api/planes-comerciales/planes/${encodeURIComponent(plan.numeroCido)}/estatus`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estatus: nuevo, usuario: usuario?.nombreCompleto || '' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setMsg({ ok: true, text: `${fmtNum(d.updated)} fila(s) de ${plan.numeroCido} actualizadas a "${nuevo}".` })
      await load(page, search)
      if (expanded === plan.numeroCido) await loadRows(plan.numeroCido, rowsPage)
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally { setBusyCido(null) }
  }

  function handleRowEstatus(row, nuevo) {
    setConfirmState({
      message: `¿Cambiar el estatus de esta fila (CeVe ${row.codCeve}, Item ${row.item}) a "${nuevo}"?`,
      onConfirm: () => doRowEstatus(row, nuevo),
    })
  }

  async function doRowEstatus(row, nuevo) {
    setConfirmState(null)
    setBusyRowId(row.id)
    try {
      const r = await fetch(`${API}/api/planes-comerciales/rows/${row.id}/estatus`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estatus: nuevo, usuario: usuario?.nombreCompleto || '' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setMsg({ ok: true, text: 'Fila actualizada a "' + nuevo + '".' })
      await loadRows(expanded, rowsPage)
      await load(page, search)
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally { setBusyRowId(null) }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const rowsTotalPages = rowsData ? Math.max(1, Math.ceil(rowsData.total / ROWS_PAGE_SIZE)) : 1

  return (
    <>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={searchInp}
          onChange={e => setSearchInp(e.target.value)}
          placeholder="Buscar por número de CIDO o nombre del plan…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', outline: 'none' }}
        />
        <button type="submit" className="btn primary" style={{ padding: '8px 20px', fontSize: 13 }}>Buscar</button>
      </form>

      {msg && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: msg.ok ? '#ecfdf5' : '#fef2f2', color: msg.ok ? '#065f46' : '#991b1b',
          border: `1px solid ${msg.ok ? '#6ee7b7' : '#fca5a5'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{msg.ok ? '✓' : '✕'} {msg.text}</span>
          <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14 }}>✕</button>
        </div>
      )}

      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Cargando…</div>
      ) : !data || data.rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          No se encontraron planes.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{fmtNum(data.total)} plan(es) encontrados</span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => changePage(page - 1)} disabled={page === 1}
                  style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11 }}>‹</button>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Página {page} de {totalPages}</span>
                <button onClick={() => changePage(page + 1)} disabled={page >= totalPages}
                  style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11 }}>›</button>
              </div>
            )}
          </div>
          <div style={{ overflowX: 'auto', overflowY: 'hidden', borderRadius: 12, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['', 'CIDO', 'Plan comercial', 'Año', 'Semanas', 'Filas', 'Estatus', 'Cambiar a'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600,
                      color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p, i) => (
                  <Fragment key={p.numeroCido || i}>
                    <tr style={{ borderBottom: expanded === p.numeroCido ? 'none' : '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <button onClick={() => toggleExpand(p.numeroCido)}
                          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '2px 8px', fontSize: 12 }}>
                          {expanded === p.numeroCido ? '▾' : '▸'}
                        </button>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, fontFamily: 'monospace' }}>{p.numeroCido || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>{p.planComercial}</td>
                      <td style={{ padding: '8px 12px' }}>{p.anio}</td>
                      <td style={{ padding: '8px 12px' }}>{p.semanaMin === p.semanaMax ? p.semanaMin : `${p.semanaMin}–${p.semanaMax}`}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{fmtNum(p.totalFilas)}</td>
                      <td style={{ padding: '8px 12px' }}><EstatusBadge estatus={p.estatus} /></td>
                      <td style={{ padding: '8px 12px' }}>
                        <EstatusSelector value={p.estatus} busy={busyCido === p.numeroCido}
                          onApply={nuevo => handleBulkEstatus(p, nuevo)} />
                      </td>
                    </tr>
                    {expanded === p.numeroCido && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td colSpan={8} style={{ padding: '0 12px 16px', background: '#fafbff' }}>
                          <PlanDetalle
                            data={rowsData} loading={loadingRows} page={rowsPage} totalPages={rowsTotalPages}
                            busyRowId={busyRowId}
                            onPageChange={p2 => { setRowsPage(p2); loadRows(expanded, p2) }}
                            onRowEstatus={handleRowEstatus}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'center' }}>
              <button onClick={() => changePage(1)} disabled={page === 1}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>««</button>
              <button onClick={() => changePage(page - 1)} disabled={page === 1}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>‹</button>
              <span style={{ padding: '4px 12px', fontSize: 12, color: '#6b7280' }}>Página {page} / {totalPages}</span>
              <button onClick={() => changePage(page + 1)} disabled={page >= totalPages}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>›</button>
              <button onClick={() => changePage(totalPages)} disabled={page >= totalPages}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>»»</button>
            </div>
          )}
        </>
      )}

      <ConfirmModal confirmState={confirmState} onCancel={() => setConfirmState(null)} />
    </>
  )
}

// ── Tab: Bitácora (historial de cargas, eliminaciones y cambios de Estatus) ────
const ACCION_FILTROS = [
  { value: '', label: 'Todas las acciones' },
  { value: 'carga', label: 'Carga' },
  { value: 'eliminacion', label: 'Eliminación' },
  { value: 'estatus_cido', label: 'Estatus (CIDO)' },
  { value: 'estatus_fila', label: 'Estatus (fila)' },
]

function fmtFechaBitacora(val) {
  if (!val) return '—'
  return new Date(val).toLocaleString('es-MX', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Mexico_City',
  }) + ' CDMX'
}

function TabBitacora() {
  const PAGE_SIZE = 50
  const [search, setSearch] = useState('')
  const [searchInp, setSearchInp] = useState('')
  const [accion, setAccion] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load(p, s, a) {
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/planes-comerciales/bitacora?search=${encodeURIComponent(s)}&accion=${encodeURIComponent(a)}&page=${p}&pageSize=${PAGE_SIZE}`)
      if (r.ok) setData(await r.json())
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load(1, '', '') }, [])

  function handleSearch(e) {
    e.preventDefault()
    setSearch(searchInp); setPage(1)
    load(1, searchInp, accion)
  }

  function handleAccionChange(v) {
    setAccion(v); setPage(1)
    load(1, search, v)
  }

  function changePage(p) {
    setPage(p)
    load(p, search, accion)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={searchInp}
          onChange={e => setSearchInp(e.target.value)}
          placeholder="Buscar por CIDO, usuario o detalle…"
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', outline: 'none' }}
        />
        <select value={accion} onChange={e => handleAccionChange(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}>
          {ACCION_FILTROS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <button type="submit" className="btn primary" style={{ padding: '8px 20px', fontSize: 13 }}>Buscar</button>
      </form>

      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Cargando…</div>
      ) : !data || data.rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Sin movimientos registrados.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{fmtNum(data.total)} movimiento(s)</div>
          <div style={{ overflowX: 'auto', overflowY: 'hidden', borderRadius: 12, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Fecha', 'Usuario', 'Acción', 'CIDO', 'Detalle', 'Filas'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600,
                      color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((b, i) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmtFechaBitacora(b.fecha)}</td>
                    <td style={{ padding: '8px 12px' }}>{b.usuario || '—'}</td>
                    <td style={{ padding: '8px 12px' }}><AccionBadge accion={b.accion} /></td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{b.numeroCido || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{b.detalle || '—'}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{b.filasAfectadas != null ? fmtNum(b.filasAfectadas) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'center' }}>
              <button onClick={() => changePage(1)} disabled={page === 1}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>««</button>
              <button onClick={() => changePage(page - 1)} disabled={page === 1}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>‹</button>
              <span style={{ padding: '4px 12px', fontSize: 12, color: '#6b7280' }}>Página {page} / {totalPages}</span>
              <button onClick={() => changePage(page + 1)} disabled={page >= totalPages}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>›</button>
              <button onClick={() => changePage(totalPages)} disabled={page >= totalPages}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>»»</button>
            </div>
          )}
        </>
      )}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PlanesComerciales() {
  const [tab, setTab] = useState('cargar')

  return (
    <div style={{ padding: '24px 28px 40px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
          Planes Comerciales
        </h1>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '9px 20px', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: tab === t.id ? '#2563eb' : '#6b7280',
              borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -1, transition: 'all .15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cargar' && <TabCargar />}
      {tab === 'administrar' && <TabAdministrar />}
      {tab === 'bitacora' && <TabBitacora />}
    </div>
  )
}
