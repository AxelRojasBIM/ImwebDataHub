import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { API } from '../App'

function fmtDur(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
function fmtNum(n) { return n == null ? '—' : n.toLocaleString('es-MX') }

function csvEscape(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// Acepta "19/08/2026", "2026-08-19" o una fecha real de Excel (cellDates:true) y
// siempre devuelve yyyy-MM-dd, el mismo formato de texto que ya usa fecha_captura
// en inventario_resumen.
function normalizeDate(v) {
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return s
}

// Integral Vending: .xlsx con columnas nombradas — solo se usan Cod. Agencia,
// Id Prod., Fecha y Exis. pzas; el resto del archivo se ignora.
async function parseIntegralVending(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('El archivo no tiene ninguna hoja con datos.')
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (rows.length === 0) throw new Error('El archivo no tiene filas de datos.')
  const sample = rows[0]
  if (!('Cod. Agencia' in sample) || !('Id Prod.' in sample) || !('Fecha' in sample) || !('Exis. pzas' in sample)) {
    throw new Error('No se encontraron las columnas esperadas (Cod. Agencia / Id Prod. / Fecha / Exis. pzas). Revisa el encabezado del archivo.')
  }
  const lines = ['ceve_nombre,sku_codigo,fecha_captura,cantidad_total']
  const ceves = new Set(), fechas = new Set()
  for (const r of rows) {
    const ceve = String(r['Cod. Agencia'] ?? '').trim()
    const sku = String(r['Id Prod.'] ?? '').trim()
    if (!ceve || !sku) continue
    const fecha = normalizeDate(r['Fecha'])
    const cant = String(r['Exis. pzas'] ?? '0').trim()
    lines.push(`${csvEscape(ceve)},${csvEscape(sku)},${csvEscape(fecha)},${csvEscape(cant)}`)
    ceves.add(ceve); fechas.add(fecha)
  }
  if (lines.length === 1) throw new Error('Ninguna fila tenía Cod. Agencia e Id Prod. — no hay nada que subir.')
  return {
    blob: new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }),
    count: lines.length - 1, ceveCount: ceves.size, fechas: [...fechas].sort(),
  }
}

// Wms: el CeVe y la fecha NO vienen en columnas, van codificados en el nombre del
// archivo: Existencia_<CeVe>_<AAMMDD>_<hora>.csv (ej. Existencia_012821_260820_084036
// -> CeVe 12821, fecha 2026-08-20).
function parseWmsFilename(filename) {
  const m = filename.match(/Existencia_(\d+)_(\d{2})(\d{2})(\d{2})_/)
  if (!m) throw new Error('El nombre del archivo no tiene el formato esperado: Existencia_<CeVe>_<AAMMDD>_<hora>.csv')
  const ceve = String(parseInt(m[1], 10))
  const [, , yy, mm, dd] = m
  return { ceve, fecha: `20${yy}-${mm}-${dd}` }
}

async function parseWms(file) {
  const { ceve, fecha } = parseWmsFilename(file.name)
  const text = await file.text()
  const rawLines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (rawLines.length === 0) throw new Error('El archivo está vacío.')
  const delim = rawLines[0].includes('\t') ? '\t' : ','
  const header = rawLines[0].split(delim).map(h => h.trim().toLowerCase())
  const idxCodigo = header.indexOf('codigo de producto')
  const idxDisp = header.indexOf('disponible')
  if (idxCodigo === -1 || idxDisp === -1) {
    throw new Error('No se encontraron las columnas "Codigo de Producto" / "Disponible" en el archivo.')
  }
  const lines = ['ceve_nombre,sku_codigo,fecha_captura,cantidad_total']
  for (let i = 1; i < rawLines.length; i++) {
    const cols = rawLines[i].split(delim)
    const sku = (cols[idxCodigo] ?? '').trim()
    if (!sku) continue
    const cant = (cols[idxDisp] ?? '0').trim()
    lines.push(`${csvEscape(ceve)},${csvEscape(sku)},${csvEscape(fecha)},${csvEscape(cant)}`)
  }
  if (lines.length === 1) throw new Error('Ninguna fila tenía Codigo de Producto — no hay nada que subir.')
  return {
    blob: new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }),
    count: lines.length - 1, ceveCount: 1, fechas: [fecha],
  }
}

const CHUNK_SIZE = 32 * 1024 * 1024
const MAX_RETRIES = 4

async function fetchWithRetry(url, opts) {
  let lastErr
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try { return await fetch(url, opts) }
    catch (e) { lastErr = e; if (attempt < MAX_RETRIES) await new Promise(res => setTimeout(res, 1000 * attempt)) }
  }
  throw lastErr
}

async function uploadNormalizedCsv(blob, originalFileName, origen, onProgress) {
  const initR = await fetchWithRetry(
    `${API}/api/gestion-inventarios/upload/init?fileName=${encodeURIComponent(originalFileName)}&origen=${encodeURIComponent(origen)}`,
    { method: 'POST' })
  if (!initR.ok) throw new Error(`HTTP ${initR.status} al iniciar la subida`)
  const { uploadId } = await initR.json()

  for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
    const chunk = blob.slice(offset, offset + CHUNK_SIZE)
    const r = await fetchWithRetry(
      `${API}/api/gestion-inventarios/upload/chunk?uploadId=${uploadId}&expectedOffset=${offset}`,
      { method: 'POST', body: chunk })
    if (!r.ok) throw new Error(`HTTP ${r.status} al subir el archivo (byte ${offset})`)
    onProgress(Math.round(Math.min(offset + CHUNK_SIZE, blob.size) / blob.size * 100))
  }

  const compR = await fetchWithRetry(`${API}/api/gestion-inventarios/upload/complete?uploadId=${uploadId}`, { method: 'POST' })
  const text = await compR.text()
  const d = text ? JSON.parse(text) : {}
  if (!compR.ok) throw new Error(d.detail || d.error || `HTTP ${compR.status}`)
  return d
}

function UploadCard({ title, hint, accept, badges, parseFn, origen, onUploaded }) {
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pct, setPct] = useState(null)
  const [result, setResult] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState(null) // { count, ceveCount, fechas }
  const [previewError, setPreviewError] = useState(null)
  const inputRef = useRef(null)
  // Guarda el archivo ya parseado (mismo parseFn que usa la subida) para no leerlo
  // dos veces — la vista previa de registros y la carga real usan el mismo resultado.
  const parsedRef = useRef(null)

  function acceptsFile(f) {
    return accept.some(ext => f.name.toLowerCase().endsWith(ext))
  }

  function selectFile(f) {
    setFile(f)
    setResult(null)
    setPreview(null)
    setPreviewError(null)
    parsedRef.current = null
    setPreviewLoading(true)
    parseFn(f)
      .then(({ blob, count, ceveCount, fechas }) => {
        parsedRef.current = { file: f, blob, count }
        setPreview({ count, ceveCount, fechas })
      })
      .catch(e => setPreviewError(e.message))
      .finally(() => setPreviewLoading(false))
  }

  function clearFile() {
    setFile(null); setResult(null); setPreview(null); setPreviewError(null); parsedRef.current = null
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && acceptsFile(f)) selectFile(f)
    else alert(`Solo se aceptan archivos ${accept.join(' / ')}`)
  }

  async function handleUpload() {
    const cached = parsedRef.current
    if (!file || !cached || cached.file !== file) return
    if (!confirm(`¿Cargar "${file.name}" (${cached.count.toLocaleString('es-MX')} registros) como ${origen}?`)) return
    setUploading(true); setResult(null); setPct(0)
    try {
      const d = await uploadNormalizedCsv(cached.blob, file.name, origen, setPct)
      clearFile()
      setPct(null)
      setResult({ ok: true, saved: d.totalFilas })
      onUploaded?.()
    } catch (e) {
      setPct(null)
      setResult({ ok: false, msg: e.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '20px 22px', flex: '1 1 360px', minWidth: 320,
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>{hint}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {badges.map((c, i) => (
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
          borderRadius: 10, padding: '20px 16px', textAlign: 'center',
          cursor: file ? 'default' : 'pointer',
          background: dragging ? '#eff6ff' : file ? '#f0fdf4' : 'transparent',
          transition: 'all .15s', marginBottom: 12,
        }}
      >
        <input ref={inputRef} type="file" accept={accept.join(',')} style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f); e.target.value = '' }} />
        {file ? (
          <div>
            <div style={{ fontSize: 20, marginBottom: 4 }}>📄</div>
            <div style={{ fontWeight: 700, color: '#15803d', fontSize: 13 }}>{file.name}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{(file.size / 1024 / 1024).toFixed(1)} MB</div>
            <button onClick={e => { e.stopPropagation(); clearFile() }}
              style={{ marginTop: 8, fontSize: 12, padding: '3px 10px', borderRadius: 6,
                border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
              ✕ Quitar
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 24, marginBottom: 6 }}>☁</div>
            <div style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>
              Arrastra el archivo o <span style={{ color: '#2563eb' }}>haz clic</span>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{accept.join(' / ')}</div>
          </div>
        )}
      </div>

      {!uploading && (previewLoading || preview || previewError) && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12.5,
          marginBottom: 12, color: previewError ? '#b91c1c' : previewLoading ? '#9ca3af' : '#15803d',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5,
            background: previewError ? '#ef4444' : previewLoading ? '#d1d5db' : '#22c55e',
          }} />
          {previewLoading ? 'Leyendo archivo…' : previewError ? previewError : (
            <span>
              <strong>{preview.count.toLocaleString('es-MX')}</strong> registros listos para cargar
              <span style={{ color: '#6b7280' }}>
                {' · '}{preview.ceveCount.toLocaleString('es-MX')} {preview.ceveCount === 1 ? 'CeVe' : 'CeVes'} únicos
                {' · '}fecha {preview.fechas.length === 1 ? preview.fechas[0] : `${preview.fechas.length} fechas distintas`}
              </span>
            </span>
          )}
        </div>
      )}

      <button className="btn primary" onClick={handleUpload} disabled={!file || uploading || previewLoading || !!previewError}
        style={{ padding: '8px 22px', fontWeight: 700, fontSize: 13 }}>
        {uploading ? (pct != null ? `⏳ Subiendo… ${pct}%` : '⏳ Procesando…') : '↑ Cargar archivo'}
      </button>

      {result && !uploading && (
        <div style={{ marginTop: 12, padding: '9px 14px', borderRadius: 8, fontSize: 13,
          background: result.ok ? '#ecfdf5' : '#fef2f2',
          color: result.ok ? '#065f46' : '#991b1b',
          border: `1px solid ${result.ok ? '#6ee7b7' : '#fca5a5'}` }}>
          {result.ok ? `✓ ${fmtNum(result.saved)} registros cargados.` : `✕ ${result.msg}`}
        </div>
      )}
    </div>
  )
}

function downloadCsv(filename, rows) {
  const content = rows.map(r => r.map(csvEscape).join(',')).join('\n') + '\n'
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Punto de estado: verde con palomita si esa fuente ya trajo datos de ese CeVe
// en la fecha consultada, gris apagado si no.
function EstadoPunto({ ok }) {
  return (
    <span title={ok ? 'Con datos' : 'Sin datos'} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 20, height: 20, borderRadius: '50%', fontSize: 11, fontWeight: 700,
      background: ok ? '#22c55e' : '#e5e7eb', color: ok ? '#fff' : '#9ca3af',
    }}>{ok ? '✓' : '·'}</span>
  )
}

function ExtractoInventarioCard() {
  const [fecha, setFecha] = useState(todayIso())
  const [consultando, setConsultando] = useState(false)
  const [cobertura, setCobertura] = useState(null)
  const [error, setError] = useState(null)
  const [exportando, setExportando] = useState(false)
  const [exportResult, setExportResult] = useState(null)

  async function handleConsultar() {
    if (!fecha) return
    setConsultando(true); setError(null); setCobertura(null); setExportResult(null)
    try {
      const r = await fetch(`${API}/api/gestion-inventarios/cobertura?fecha=${fecha}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setCobertura(await r.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setConsultando(false)
    }
  }

  async function handleExportar() {
    if (!fecha) return
    setExportando(true); setExportResult(null)
    try {
      const r = await fetch(`${API}/api/gestion-inventarios/extracto?fecha=${fecha}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const rows = await r.json()
      if (rows.length === 0) {
        setExportResult({ ok: true, count: 0 })
        return
      }
      const header = ['Origen', 'Fecha', 'CeVe', 'Nombre CeVe', 'Región', 'Organización', 'Item', 'Cantidad Total']
      const body = rows.map(r => [r.origen, r.fechaCaptura, r.ceveNombre, r.nombreCeve, r.region, r.organizacion, r.skuCodigo, r.cantidadTotal])
      downloadCsv(`extracto_inventario_${fecha}.csv`, [header, ...body])
      setExportResult({ ok: true, count: rows.length })
    } catch (e) {
      setExportResult({ ok: false, msg: e.message })
    } finally {
      setExportando(false)
    }
  }

  const totalConDatos = cobertura?.filter(c => c.ivy || c.ivyPioneros || c.integralVending || c.wms).length ?? 0
  const fueraCatalogo = cobertura?.filter(c => !c.enCatalogo) ?? []
  const totalesPorFuente = cobertura ? {
    ivy: cobertura.filter(c => c.ivy).length,
    ivyPioneros: cobertura.filter(c => c.ivyPioneros).length,
    integralVending: cobertura.filter(c => c.integralVending).length,
    wms: cobertura.filter(c => c.wms).length,
  } : null

  function handleDescargarFueraCatalogo() {
    const header = ['CeVe', 'IVY', 'IVY Pioneros', 'IV', 'WMS']
    const body = fueraCatalogo.map(c => [c.codigoCeve, c.ivy ? 'Sí' : '', c.ivyPioneros ? 'Sí' : '', c.integralVending ? 'Sí' : '', c.wms ? 'Sí' : ''])
    downloadCsv(`ceves_fuera_de_catalogo_${fecha}.csv`, [header, ...body])
  }

  // Resumen por Organización (una tarjeta por cada una, ej. Bimbo / Barcel), con
  // desglose de CeVes con datos / total por Región dentro de cada tarjeta.
  const resumenPorOrg = []
  if (cobertura) {
    const orgMap = new Map()
    for (const c of cobertura) {
      const conDatos = c.ivy || c.ivyPioneros || c.integralVending || c.wms
      const org = c.organizacion ?? 'Sin organización'
      const region = c.region ?? 'Sin región'
      if (!orgMap.has(org)) orgMap.set(org, { total: 0, conDatos: 0, regiones: new Map() })
      const o = orgMap.get(org)
      o.total++; if (conDatos) o.conDatos++
      if (!o.regiones.has(region)) o.regiones.set(region, { total: 0, conDatos: 0 })
      const r = o.regiones.get(region)
      r.total++; if (conDatos) r.conDatos++
    }
    for (const [org, o] of orgMap) {
      resumenPorOrg.push({
        org, total: o.total, conDatos: o.conDatos,
        regiones: [...o.regiones.entries()]
          .map(([region, r]) => ({ region, ...r }))
          .sort((a, b) => a.region.localeCompare(b.region)),
      })
    }
    resumenPorOrg.sort((a, b) => b.total - a.total)
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '20px 22px', marginBottom: 24,
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>Extracto Inventario</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
        Consulta qué CeVes ya tienen inventario cargado por cada fuente para una fecha, antes de exportar.
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
          Fecha
          <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); setCobertura(null); setError(null); setExportResult(null) }}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }} />
        </label>
        <button className="btn primary" onClick={handleConsultar} disabled={!fecha || consultando}
          style={{ padding: '8px 22px', fontWeight: 700, fontSize: 13, height: 36 }}>
          {consultando ? '⏳ Consultando…' : '🔍 Consultar'}
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, marginTop: 12, color: '#b91c1c' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
          {error}
        </div>
      )}

      {cobertura && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
            {resumenPorOrg.map(o => {
              const pct = o.total > 0 ? Math.round(o.conDatos / o.total * 100) : 0
              return (
                <div key={o.org} style={{
                  flex: '1 1 260px', minWidth: 240, border: '1px solid var(--border)', borderRadius: 12,
                  padding: '16px 18px', background: '#fff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{o.org}</div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99,
                      background: pct === 100 ? '#dcfce7' : pct === 0 ? '#f3f4f6' : '#fef9c3',
                      color:      pct === 100 ? '#166534' : pct === 0 ? '#9ca3af' : '#854d0e',
                    }}>{pct}%</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
                    {o.conDatos.toLocaleString('es-MX')}
                    <span style={{ fontSize: 13, fontWeight: 400, color: '#9ca3af' }}> / {o.total.toLocaleString('es-MX')} CeVes</span>
                  </div>
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 6 }}>
                    {o.regiones.map(r => {
                      const rPct = r.total > 0 ? r.conDatos / r.total * 100 : 0
                      return (
                        <div key={r.region} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <span style={{ width: 74, flexShrink: 0, color: '#374151' }}>{r.region}</span>
                          <span style={{ flex: 1, height: 6, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${rPct}%`, borderRadius: 99,
                              background: rPct === 100 ? '#22c55e' : '#facc15', transition: 'width .2s' }} />
                          </span>
                          <span style={{ width: 46, textAlign: 'right', color: '#6b7280', flexShrink: 0 }}>
                            {r.conDatos}/{r.total}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 12.5, color: '#374151' }}>
              <strong>{totalConDatos.toLocaleString('es-MX')}</strong> de <strong>{cobertura.length.toLocaleString('es-MX')}</strong> CeVes con inventario cargado el {fecha}
            </div>
            <button className="btn primary" onClick={handleExportar} disabled={exportando}
              style={{ padding: '7px 18px', fontWeight: 700, fontSize: 12.5 }}>
              {exportando ? '⏳ Exportando…' : '⬇ Exportar'}
            </button>
          </div>

          {fueraCatalogo.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <button onClick={handleDescargarFueraCatalogo} style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 11.5, color: '#9ca3af', textDecoration: 'underline', textUnderlineOffset: 2,
              }}>
                ⬇ {fueraCatalogo.length} código{fueraCatalogo.length === 1 ? '' : 's'} de CeVe con existencia pero fuera del catálogo
              </button>
            </div>
          )}

          {exportResult && !exportando && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, marginBottom: 12,
              color: !exportResult.ok ? '#b91c1c' : exportResult.count === 0 ? '#9ca3af' : '#15803d',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: !exportResult.ok ? '#ef4444' : exportResult.count === 0 ? '#d1d5db' : '#22c55e',
              }} />
              {!exportResult.ok
                ? exportResult.msg
                : exportResult.count === 0
                  ? `Sin datos para ${fecha}.`
                  : <span><strong>{exportResult.count.toLocaleString('es-MX')}</strong> filas exportadas a CSV</span>}
            </div>
          )}

          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 480, borderRadius: 12, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['CeVe', 'Nombre', 'Región', 'Organización', 'IVY', 'IVY Pioneros', 'IV', 'WMS'].map((h, i) => (
                    <th key={h} style={{
                      padding: '9px 14px', height: 34, boxSizing: 'border-box', textAlign: i >= 4 ? 'center' : 'left', fontWeight: 600,
                      color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                      position: 'sticky', top: 0, background: '#f9fafb', zIndex: 2,
                    }}>{h}</th>
                  ))}
                </tr>
                {/* Fila de totales fija: no se mueve al hacer scroll de la tabla, para
                    comparar cuántos CeVes trajo cada sistema sin perder de vista el conteo. */}
                <tr style={{ background: '#eef2ff' }}>
                  <th colSpan={4} style={{
                    padding: '6px 14px', height: 30, boxSizing: 'border-box', textAlign: 'left', fontWeight: 700,
                    color: '#3730a3', fontSize: 11.5, borderBottom: '2px solid #c7d2fe',
                    position: 'sticky', top: 34, background: '#eef2ff', zIndex: 2,
                  }}>Total CeVes por sistema</th>
                  {['ivy', 'ivyPioneros', 'integralVending', 'wms'].map(k => (
                    <th key={k} style={{
                      padding: '6px 14px', height: 30, boxSizing: 'border-box', textAlign: 'center', fontWeight: 700,
                      color: '#3730a3', fontSize: 12.5, borderBottom: '2px solid #c7d2fe',
                      position: 'sticky', top: 34, background: '#eef2ff', zIndex: 2,
                    }}>{totalesPorFuente[k].toLocaleString('es-MX')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cobertura.map((c, i) => (
                  <tr key={c.codigoCeve} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '6px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.codigoCeve}</td>
                    {c.enCatalogo ? (
                      <>
                        <td style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}>{c.nombreCeve ?? '—'}</td>
                        <td style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}>{c.region ?? '—'}</td>
                        <td style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}>{c.organizacion ?? '—'}</td>
                      </>
                    ) : (
                      <td colSpan={3} style={{ padding: '6px 14px', whiteSpace: 'nowrap', fontStyle: 'italic', color: '#b45309' }}>
                        Fuera del catálogo
                      </td>
                    )}
                    <td style={{ padding: '6px 14px', textAlign: 'center' }}><EstadoPunto ok={c.ivy} /></td>
                    <td style={{ padding: '6px 14px', textAlign: 'center' }}><EstadoPunto ok={c.ivyPioneros} /></td>
                    <td style={{ padding: '6px 14px', textAlign: 'center' }}><EstadoPunto ok={c.integralVending} /></td>
                    <td style={{ padding: '6px 14px', textAlign: 'center' }}><EstadoPunto ok={c.wms} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Carga Inventario ─────────────────────────────────────────────────────
function TabCargaInventario() {
  const [batches, setBatches] = useState([])
  const [loadingB, setLoadingB] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const pollRef = useRef(null)
  const deletePollRef = useRef(null)

  async function loadBatches() {
    try {
      const r = await fetch(`${API}/api/gestion-inventarios/batches`)
      if (r.ok) setBatches(await r.json())
    } catch {}
  }

  function pollUntilDone() {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      await loadBatches()
    }, 3000)
  }

  useEffect(() => {
    loadBatches().finally(() => setLoadingB(false))
    return () => { clearInterval(pollRef.current); clearInterval(deletePollRef.current) }
  }, [])

  useEffect(() => {
    const enCurso = batches.some(b => b.estado === 'ejecutando')
    const eliminando = batches.some(b => b.estado === 'eliminando')
    if (enCurso || eliminando) pollUntilDone()
    else clearInterval(pollRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches])

  async function handleDelete(batchId, label) {
    if (!confirm(`¿Eliminar el lote "${label}"? Esto borra sus filas de inventario_resumen. Si el lote es grande puede tardar varios minutos.`)) return
    setDeleting(batchId)
    try {
      const r = await fetch(`${API}/api/gestion-inventarios/batches/${batchId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await loadBatches()
    } catch (e) {
      alert(`No se pudo iniciar la eliminación: ${e.message}`)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
        <UploadCard
          title="Integral Vending"
          hint="Archivo .xlsx — se usan Cod. Agencia, Id Prod., Fecha y Exis. pzas; el resto de columnas se ignora."
          accept={['.xlsx']}
          badges={['Cod. Agencia', 'Id Prod.', 'Fecha', 'Exis. pzas']}
          parseFn={parseIntegralVending}
          origen="Integral vending"
          onUploaded={loadBatches}
        />
        <UploadCard
          title="Wms"
          hint='Archivo .csv — el CeVe y la fecha se toman del nombre del archivo (Existencia_<CeVe>_<AAMMDD>_<hora>), no de columnas.'
          accept={['.csv']}
          badges={['Codigo de Producto', 'Disponible', 'nombre: Existencia_012821_260820_084036']}
          parseFn={parseWms}
          origen="Wms"
          onUploaded={loadBatches}
        />
      </div>

      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 12 }}>
        Historial de lotes
      </div>
      {loadingB ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Cargando…</div>
      ) : batches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Sin lotes registrados aún.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Origen', 'Archivo', 'Registros', 'Duración', 'Cargado el', 'Estado', ''].map(h => (
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
    </>
  )
}

// ── Página principal (pestañas, mismo patrón que Frecuencias Producto CeVes) ──
const TABS = [
  { key: 'carga',    label: 'Carga Inventario',    sub: 'Integral Vending · Wms', icon: '📥' },
  { key: 'extracto', label: 'Extracto Inventario', sub: 'inventario_resumen',     icon: '📤' },
]

export default function GestionInventarios() {
  const [tab, setTab] = useState('carga')

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Gestión de Inventarios</div>
          <div className="topbar-sub">Carga existencias de Integral Vending y Wms, y extrae el inventario consolidado.</div>
        </div>
      </div>

      <div className="content">
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
              borderBottom: tab === t.key ? '2px solid #1a56db' : '2px solid transparent',
              marginBottom: -2, background: 'transparent',
              color: tab === t.key ? '#1a56db' : '#6b7280', transition: 'color 0.15s',
            }}>
              <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
              <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9ca3af', marginTop: 1 }}>{t.sub}</span>
            </button>
          ))}
        </div>

        {tab === 'carga'    && <TabCargaInventario />}
        {tab === 'extracto' && <ExtractoInventarioCard />}
      </div>
    </>
  )
}
