import { useState, useEffect, useRef } from 'react'
import { API } from '../App'

function fmtDur(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

const TABS = [
  { id: 'fillrate',   label: '⚙ Fill Rate' },
  { id: 'cadena',     label: '📋 Cadena Suministro' },
  { id: 'remisiones', label: '🔗 Catálogo Remisiones' },
]

// ── Tab: Fill Rate Ejecución ──────────────────────────────────────────────────
function TabFillRate() {
  const today = new Date().toISOString().slice(0, 10)
  const [fechaInicio, setFechaInicio] = useState(today)
  const [fechaFin, setFechaFin]       = useState(today)
  const [running, setRunning]         = useState(false)
  const [estado, setEstado]           = useState(null)
  const [result, setResult]           = useState(null)
  const [historial, setHistorial]     = useState([])
  const [loadingH, setLoadingH]       = useState(true)
  const pollRef = useRef(null)

  async function loadHistorial() {
    setLoadingH(true)
    try {
      const r = await fetch(`${API}/api/fill-rate/historial`)
      if (r.ok) setHistorial(await r.json())
    } catch {}
    finally { setLoadingH(false) }
  }

  async function checkEstado() {
    try {
      const r = await fetch(`${API}/api/fill-rate/estado`)
      if (!r.ok) return
      const d = await r.json()
      setEstado(d)
      if (d.estado === 'completado' || d.estado === 'error') {
        clearInterval(pollRef.current)
        setRunning(false)
        if (d.estado === 'completado') setResult({ ok: true, d: d.resultado })
        else setResult({ ok: false, msg: d.error })
        loadHistorial()
      }
    } catch {}
  }

  useEffect(() => {
    loadHistorial()
    checkEstado().then(() => {
      // Si ya había una ejecución en curso (p.ej. tras recargar la página), retoma el polling
      setEstado(prev => {
        if (prev?.estado === 'ejecutando') {
          setRunning(true)
          pollRef.current = setInterval(checkEstado, 3000)
        }
        return prev
      })
    })
    return () => clearInterval(pollRef.current)
  }, [])

  async function handleEjecutar() {
    if (!fechaInicio || !fechaFin) return
    if (fechaFin < fechaInicio) { alert('La fecha fin no puede ser anterior a la fecha inicio.'); return }
    if (!confirm(`¿Ejecutar Fill Rate del ${fechaInicio} al ${fechaFin}? Esto puede tardar varios minutos.`)) return

    setRunning(true); setResult(null)
    try {
      const r = await fetch(`${API}/api/fill-rate/ejecutar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaInicio, fechaFin, usuario: 'axel.rojas' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`)
      pollRef.current = setInterval(checkEstado, 3000)
    } catch (e) {
      setRunning(false)
      setResult({ ok: false, msg: e.message })
    }
  }

  const pct = estado?.totalDias ? Math.round((estado.diasCompletados / estado.totalDias) * 100) : 0

  return (
    <>
      <div style={{
        background: '#f8faff', border: '1px solid #c7d7fd', borderRadius: 14,
        padding: '22px 24px', marginBottom: 28,
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e3a8a', marginBottom: 16 }}>
          Parámetros de ejecución
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: '#374151' }}>
            Fecha inicio
            <input type="date" value={fechaInicio} max={today} disabled={running}
              onChange={e => setFechaInicio(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: '#374151' }}>
            Fecha fin
            <input type="date" value={fechaFin} max={today} disabled={running}
              onChange={e => setFechaFin(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }} />
          </label>
          <button className="btn primary" onClick={handleEjecutar}
            disabled={running || !fechaInicio || !fechaFin}
            style={{ padding: '9px 28px', fontWeight: 700, fontSize: 14, height: 38 }}>
            {running ? '⏳ Ejecutando…' : '▶ Ejecutar'}
          </button>
        </div>

        {running && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#1d4ed8', marginBottom: 6 }}>
              <span>
                {estado?.fechaActual
                  ? `Procesando ${estado.fechaActual} — día ${estado.diasCompletados ?? 0} de ${estado.totalDias ?? '…'}`
                  : 'Preparando datos…'}
              </span>
              <span style={{ fontWeight: 700 }}>{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: '#dbeafe', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`, background: '#2563eb',
                transition: 'width .4s ease', borderRadius: 99,
              }} />
            </div>
          </div>
        )}

        {result && !running && (() => {
          const diasConError = result.ok ? (result.d?.diasConError ?? []) : []
          const parcial = diasConError.length > 0
          return (
            <div style={{
              marginTop: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: !result.ok ? '#fef2f2' : parcial ? '#fffbeb' : '#ecfdf5',
              color:      !result.ok ? '#991b1b' : parcial ? '#92400e' : '#065f46',
              border: `1px solid ${!result.ok ? '#fca5a5' : parcial ? '#fde68a' : '#6ee7b7'}`,
            }}>
              {!result.ok
                ? `✕ ${result.msg}`
                : parcial
                  ? `⚠ Ejecución completada con ${diasConError.length} día(s) que fallaron y se saltaron — ${result.d?.totalCeves ?? 0} CeVes en ${fmtDur(result.d?.duracionMs)}. Vuelve a ejecutar solo estas fechas: ${diasConError.join(', ')}`
                  : `✓ Ejecución completada — ${result.d?.totalCeves ?? 0} CeVes, ${result.d?.diasCompletados ?? 0} días en ${fmtDur(result.d?.duracionMs)}`}
            </div>
          )
        })()}
      </div>

      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 12 }}>
        Historial de ejecuciones
      </div>
      {loadingH ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Cargando historial…</div>
      ) : historial.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Sin ejecuciones registradas aún.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Fecha inicio','Fecha fin','Ejecutado por','Ejecutado el','Hora','Avance','Duración','CeVes','Estado'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                    color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historial.map((row, i) => {
                const dt    = row.ejecutadoEl ? new Date(row.ejecutadoEl) : null
                const fecha = dt ? dt.toLocaleDateString('es-MX') : '—'
                const hora  = dt ? dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
                const enCurso = row.estado === 'ejecutando'
                const parcial = row.estado === 'OK_PARCIAL'
                return (
                  <tr key={row.id ?? i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '9px 14px' }}>{row.fechaInicio?.slice(0,10) ?? '—'}</td>
                    <td style={{ padding: '9px 14px' }}>{row.fechaFin?.slice(0,10) ?? '—'}</td>
                    <td style={{ padding: '9px 14px' }}>{row.usuario ?? '—'}</td>
                    <td style={{ padding: '9px 14px' }}>{fecha}</td>
                    <td style={{ padding: '9px 14px' }}>{hora}</td>
                    <td style={{ padding: '9px 14px' }}>
                      {row.totalDias ? `${row.diasCompletados ?? 0} / ${row.totalDias} días` : '—'}
                    </td>
                    <td style={{ padding: '9px 14px' }}>{fmtDur(row.duracionMs)}</td>
                    <td style={{ padding: '9px 14px', fontWeight: 600 }}>{row.totalCeves ?? 0}</td>
                    <td style={{ padding: '9px 14px' }} title={parcial ? row.detalle ?? '' : ''}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                        background: row.estado === 'OK' ? '#dcfce7' : enCurso ? '#dbeafe' : parcial ? '#fef3c7' : '#fef2f2',
                        color:      row.estado === 'OK' ? '#166534' : enCurso ? '#1d4ed8' : parcial ? '#92400e' : '#991b1b',
                      }}>{enCurso ? 'ejecutando' : parcial ? 'parcial' : (row.estado ?? '—')}</span>
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

// ── Tab: Catálogo Cadena Suministro ───────────────────────────────────────────
const CADENA_COLS = ['Semana','Cod_ceve','Item','Produce','Recoge','Distribuye','Linea']

function TabCadena() {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [batches, setBatches] = useState([])
  const [loadingB, setLoadingB] = useState(true)
  const inputRef = useRef()

  async function loadBatches() {
    setLoadingB(true)
    try {
      const r = await fetch(`${API}/api/cadena-suministro/batches`)
      if (r.ok) setBatches(await r.json())
    } catch {}
    finally { setLoadingB(false) }
  }

  useEffect(() => { loadBatches() }, [])

  async function uploadFile(file) {
    if (!file) return
    setUploading(true); setUploadResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await fetch(`${API}/api/cadena-suministro/upload`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`)
      setUploadResult({ ok: true, d })
      await loadBatches()
    } catch (e) {
      setUploadResult({ ok: false, msg: e.message })
    } finally { setUploading(false) }
  }

  async function deleteBatch(batchId) {
    if (!confirm('¿Eliminar este lote de datos?')) return
    try {
      await fetch(`${API}/api/cadena-suministro/batches/${batchId}`, { method: 'DELETE' })
      await loadBatches()
    } catch {}
  }

  return (
    <>
      {/* Columnas referencia */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Columnas del template:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CADENA_COLS.map(c => (
            <span key={c} style={{
              background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
              borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600,
            }}>{c}</span>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); uploadFile(e.dataTransfer.files[0]) }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#3b82f6' : '#c7d7fd'}`,
          borderRadius: 14, padding: '36px 24px', textAlign: 'center',
          cursor: 'pointer', background: dragging ? '#eff6ff' : '#f8faff',
          transition: 'all .15s', marginBottom: 20,
        }}
      >
        <input ref={inputRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
          onChange={e => uploadFile(e.target.files[0])} />
        <div style={{ fontSize: 28, marginBottom: 10 }}>📂</div>
        {uploading
          ? <div style={{ fontSize: 14, color: '#3b82f6', fontWeight: 600 }}>⏳ Cargando archivo…</div>
          : <div style={{ fontSize: 14, color: '#6b7280' }}>
              Arrastra tu CSV aquí o <span style={{ color: '#3b82f6', fontWeight: 600 }}>selecciona un archivo</span>
            </div>
        }
      </div>

      {uploadResult && (
        <div style={{
          marginBottom: 18, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: uploadResult.ok ? '#ecfdf5' : '#fef2f2',
          color:      uploadResult.ok ? '#065f46'  : '#991b1b',
          border: `1px solid ${uploadResult.ok ? '#6ee7b7' : '#fca5a5'}`,
        }}>
          {uploadResult.ok
            ? `✓ ${uploadResult.d.saved?.toLocaleString()} registros cargados correctamente.`
            : `✕ ${uploadResult.msg}`}
        </div>
      )}

      {/* Historial lotes */}
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 12 }}>
        Historial de cargas
      </div>
      {loadingB ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Cargando…</div>
      ) : batches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Sin cargas registradas.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Archivo','Registros','Cargado el',''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                    color: '#374151', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((b, i) => {
                const dt = b.cargadoEn ? new Date(b.cargadoEn) : null
                return (
                  <tr key={b.batchId} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '9px 14px' }}>{b.nombreArchivo}</td>
                    <td style={{ padding: '9px 14px', fontWeight: 600 }}>{b.totalFilas?.toLocaleString()}</td>
                    <td style={{ padding: '9px 14px' }}>{dt ? dt.toLocaleString('es-MX') : '—'}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <button onClick={() => deleteBatch(b.batchId)}
                        style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6,
                          color: '#dc2626', cursor: 'pointer', padding: '3px 10px', fontSize: 12 }}>
                        Eliminar
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

// ── Tab: Catálogo Generado Remisiones ─────────────────────────────────────────
const REM_COLS = ['OrigenId','Origen','DestinoId','Destino','Producto','Descripcion','FechaCierreEmbarque']

function TabRemisiones() {
  const [estado, setEstado]       = useState(null)
  const [generating, setGenerating] = useState(false)
  const [datos, setDatos]         = useState(null)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [searchInp, setSearchInp] = useState('')
  const pollRef = useRef(null)
  const PAGE_SIZE = 100

  async function loadDatos(p = 1, s = '') {
    try {
      const r = await fetch(`${API}/api/catalogo-remisiones/datos?page=${p}&pageSize=${PAGE_SIZE}&search=${encodeURIComponent(s)}`)
      if (r.ok) setDatos(await r.json())
    } catch {}
  }

  async function checkEstado() {
    try {
      const r = await fetch(`${API}/api/catalogo-remisiones/estado`)
      if (!r.ok) return
      const d = await r.json()
      setEstado(d)
      if (d.estado === 'completado' || d.estado === 'error') {
        clearInterval(pollRef.current)
        setGenerating(false)
        if (d.estado === 'completado') loadDatos(1, search)
      }
    } catch {}
  }

  useEffect(() => {
    checkEstado()
    loadDatos(1, '')
    return () => clearInterval(pollRef.current)
  }, [])

  async function handleGenerar() {
    if (!confirm('¿Generar Catálogo de Remisiones? Esto reemplaza el catálogo existente.')) return
    setGenerating(true)
    try {
      await fetch(`${API}/api/catalogo-remisiones/generar`, { method: 'POST' })
      pollRef.current = setInterval(checkEstado, 4000)
    } catch (e) {
      setGenerating(false)
      alert('Error al iniciar generación: ' + e.message)
    }
  }

  function handleSearch(e) {
    e.preventDefault()
    setSearch(searchInp)
    setPage(1)
    loadDatos(1, searchInp)
  }

  function changePage(p) {
    setPage(p)
    loadDatos(p, search)
  }

  const totalPages = datos ? Math.ceil(datos.total / PAGE_SIZE) : 1

  return (
    <>
      {/* Generar */}
      <div style={{
        background: '#f8faff', border: '1px solid #c7d7fd', borderRadius: 14,
        padding: '20px 24px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1e3a8a' }}>
            Generar catálogo desde RemisionesProductosCEQ
          </div>
          {estado?.lastExec || datos?.lastExec ? (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              Última ejecución: {new Date((estado?.resultado?.duracionMs != null ? null : null) ||
                (datos?.lastExec?.ejecutadoEl ?? estado?.resultado)).toLocaleString('es-MX') || '—'}
              {' · '}{(datos?.lastExec?.totalFilas ?? estado?.resultado?.totalFilas ?? 0).toLocaleString()} registros
            </div>
          ) : null}
        </div>
        <button
          className="btn primary"
          onClick={handleGenerar}
          disabled={generating}
          style={{ padding: '9px 28px', fontWeight: 700, fontSize: 14 }}
        >
          {generating ? '⏳ Generando…' : '▶ Generar catálogo'}
        </button>
      </div>

      {/* Progreso */}
      {generating && (
        <div style={{
          marginBottom: 18, padding: '12px 16px', borderRadius: 10, fontSize: 13,
          background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8',
        }}>
          <span style={{ marginRight: 10 }}>⏳</span>
          Ejecutando la consulta sobre RemisionesProductosCEQ, esto puede tardar varios minutos…
          <span style={{ marginLeft: 10, opacity: 0.6 }}>Estado: {estado?.estado ?? 'iniciando'}</span>
        </div>
      )}

      {estado?.estado === 'error' && (
        <div style={{
          marginBottom: 18, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5',
        }}>
          ✕ Error en generación: {estado.error}
        </div>
      )}

      {/* Buscador */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={searchInp}
          onChange={e => setSearchInp(e.target.value)}
          placeholder="Buscar por OrigenId, DestinoId, Producto…"
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
            fontSize: 13, background: '#fff', outline: 'none',
          }}
        />
        <button type="submit" className="btn primary" style={{ padding: '8px 20px', fontSize: 13 }}>
          Buscar
        </button>
      </form>

      {/* Tabla */}
      {!datos ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Cargando datos…</div>
      ) : datos.total === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Sin datos. Ejecuta la generación del catálogo.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
            {datos.total.toLocaleString()} registros
            {datos.lastExec && ` · generado el ${new Date(datos.lastExec.ejecutadoEl).toLocaleString('es-MX')}`}
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['OrigenId','Origen','DestinoId','Destino','Producto','Descripción','Fecha Cierre'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600,
                      color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 600 }}>{r.origenId}</td>
                    <td style={{ padding: '7px 12px' }}>{r.origen}</td>
                    <td style={{ padding: '7px 12px', fontWeight: 600 }}>{r.destinoId}</td>
                    <td style={{ padding: '7px 12px' }}>{r.destino}</td>
                    <td style={{ padding: '7px 12px', fontFamily: 'monospace' }}>{r.producto}</td>
                    <td style={{ padding: '7px 12px' }}>{r.descripcion}</td>
                    <td style={{ padding: '7px 12px' }}>{r.fechaCierreEmbarque ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'center' }}>
              <button onClick={() => changePage(1)} disabled={page === 1}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>
                ««
              </button>
              <button onClick={() => changePage(page - 1)} disabled={page === 1}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>
                ‹
              </button>
              <span style={{ padding: '4px 12px', fontSize: 12, color: '#6b7280' }}>
                Página {page} / {totalPages}
              </span>
              <button onClick={() => changePage(page + 1)} disabled={page >= totalPages}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>
                ›
              </button>
              <button onClick={() => changePage(totalPages)} disabled={page >= totalPages}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>
                »»
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FillRate() {
  const [tab, setTab] = useState('fillrate')

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
          Fill Rate Planta/Cedis a CeVe
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
          Ejecución del proceso de Fill Rate, catálogo de cadena de suministro y catálogo de remisiones.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
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

      {tab === 'fillrate'   && <TabFillRate />}
      {tab === 'cadena'     && <TabCadena />}
      {tab === 'remisiones' && <TabRemisiones />}
    </div>
  )
}
