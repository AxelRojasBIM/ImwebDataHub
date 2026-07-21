import { useState, useEffect, useRef } from 'react'
import { API } from '../App'

function fmtDur(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function CausasRecorte() {
  const [file, setFile]           = useState(null)
  const [running, setRunning]     = useState(false)
  const [result, setResult]       = useState(null)
  const [historial, setHistorial] = useState([])
  const [loadingH, setLoadingH]   = useState(true)
  const [deletingId, setDeletingId] = useState(null)
  const inputRef = useRef()

  async function loadHistorial() {
    setLoadingH(true)
    try {
      const r = await fetch(`${API}/api/causas-recorte/historial`)
      if (r.ok) setHistorial(await r.json())
    } catch {}
    finally { setLoadingH(false) }
  }

  useEffect(() => { loadHistorial() }, [])

  const handleDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) { setFile(f); setResult(null) }
  }
  const handleFile = (e) => {
    const f = e.target.files[0]
    if (f) { setFile(f); setResult(null) }
  }

  async function handleEjecutar() {
    if (!file) return
    if (!confirm(`¿Procesar "${file.name}"? Se agrupará por CeVe+Item+Fecha (sin canal) para diagnosticar la causa del recorte, y se guardará directo (a nivel canal) en el historial.`)) return

    setRunning(true); setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('usuario', 'axel.rojas')
      const r = await fetch(`${API}/api/causas-recorte/ejecutar`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`)
      setResult({ ok: true, d })
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      await loadHistorial()
    } catch (e) {
      setResult({ ok: false, msg: e.message })
    } finally {
      setRunning(false)
    }
  }

  function handleExportar(ejecucionId) {
    window.open(`${API}/api/causas-recorte/exportar?ejecucionId=${encodeURIComponent(ejecucionId)}`, '_blank')
  }

  async function handleEliminar(ejecucionId) {
    if (!confirm('¿Eliminar esta ejecución y todos sus resultados? Esta acción no se puede deshacer.')) return
    setDeletingId(ejecucionId)
    try {
      await fetch(`${API}/api/causas-recorte/ejecuciones/${encodeURIComponent(ejecucionId)}`, { method: 'DELETE' })
      await loadHistorial()
    } catch {}
    finally { setDeletingId(null) }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
          Causas Recorte
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
          Diagnostica la causa del recorte (Recorte Fábrica vs. Consumo arriba del promedio) cruzando contra Post-Mortem, Fill Rate y Promedios de Pedido.
        </p>
      </div>

      {/* Carga de archivo */}
      <div style={{
        background: '#f8faff', border: '1px solid #c7d7fd', borderRadius: 14,
        padding: '22px 24px', marginBottom: 28,
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e3a8a', marginBottom: 16 }}>
          Cargar archivo
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current.click()}
          style={{
            border: '2px dashed #93b4fd', borderRadius: 12,
            padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
            background: file ? '#ecfdf5' : '#fff',
            marginBottom: 16, transition: 'background 0.15s'
          }}
        >
          <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
          <div style={{ fontSize: 28, marginBottom: 6 }}>↑</div>
          {file ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{file.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{(file.size / 1024).toFixed(0)} KB · Clic para cambiar</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Arrastra tu archivo aquí</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>o haz clic para seleccionar · .csv</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                Columnas: Codigo_CeVe, CeVe, Región Logística, Fecha de Venta, Nombre Día, Semana, Item, Descripción producto,
                Categoría Resumida, Marca, Nombre canal Indicadores, Cupo, Precio, Pedido Sin Incidencias Pzs/$,
                Cargo Pzs/$, Cargo sin aumento Pzs/$, Recorte Pzs/$
              </div>
            </>
          )}
        </div>

        <button className="btn primary" onClick={handleEjecutar}
          disabled={!file || running}
          style={{ padding: '9px 28px', fontWeight: 700, fontSize: 14, height: 38 }}>
          {running ? '⏳ Procesando…' : '▶ Ejecutar'}
        </button>

        {running && (
          <div style={{ marginTop: 16, fontSize: 13, color: '#1d4ed8' }}>
            ⏳ Agrupando, cruzando contra Post-Mortem/Fill Rate/Promedios y guardando… puede tardar varios minutos si el archivo cubre un rango amplio de fechas.
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
              ? `✓ Guardado — ${result.d?.totalFilas?.toLocaleString() ?? 0} filas en ${fmtDur(result.d?.duracionMs)} (${result.d?.fechaInicio} a ${result.d?.fechaFin})`
              : `✕ ${result.msg}`}
          </div>
        )}
      </div>

      {/* Historial */}
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 12 }}>
        Historial de ejecuciones
      </div>
      {loadingH ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Cargando historial…</div>
      ) : historial.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Sin ejecuciones registradas aún.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Rango de fechas','Ejecutado por','Ejecutado el','Duración','Filas','Estado',''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                    color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historial.map((row, i) => {
                const dt = row.ejecutadoEl ? new Date(row.ejecutadoEl) : null
                const enCurso = row.estado === 'ejecutando'
                const eliminando = deletingId === row.ejecucionId
                return (
                  <tr key={row.ejecucionId ?? i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '9px 14px' }}>{row.fechaInicio === row.fechaFin ? row.fechaInicio : `${row.fechaInicio} a ${row.fechaFin}`}</td>
                    <td style={{ padding: '9px 14px' }}>{row.usuario ?? '—'}</td>
                    <td style={{ padding: '9px 14px' }}>{dt ? dt.toLocaleString('es-MX') : '—'}</td>
                    <td style={{ padding: '9px 14px' }}>{fmtDur(row.duracionMs)}</td>
                    <td style={{ padding: '9px 14px', fontWeight: 600 }}>{row.totalFilas?.toLocaleString() ?? '—'}</td>
                    <td style={{ padding: '9px 14px' }} title={row.detalle ?? ''}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                        background: row.estado === 'OK' ? '#dcfce7' : enCurso ? '#dbeafe' : '#fef2f2',
                        color:      row.estado === 'OK' ? '#166534' : enCurso ? '#1d4ed8' : '#991b1b',
                      }}>{row.estado}</span>
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      {row.estado === 'OK' && (
                        <button onClick={() => handleExportar(row.ejecucionId)}
                          style={{ background: 'none', border: '1px solid #93b4fd', borderRadius: 6,
                            color: '#1d4ed8', cursor: 'pointer', padding: '3px 10px', fontSize: 12, marginRight: 6 }}>
                          Exportar
                        </button>
                      )}
                      <button onClick={() => handleEliminar(row.ejecucionId)} disabled={eliminando}
                        style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6,
                          color: '#dc2626', cursor: eliminando ? 'default' : 'pointer', padding: '3px 10px', fontSize: 12,
                          opacity: eliminando ? 0.5 : 1 }}>
                        {eliminando ? '…' : 'Eliminar'}
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
