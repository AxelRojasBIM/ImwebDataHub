import { useState, useEffect, useRef } from 'react'
import { API } from '../App'

function fmtDur(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

// Mismo orden que ExistenciaTeoricaResultCols en el backend
const RESULT_COLS = [
  'Cod_ceve','Nombre_Indicadores_Almacenes_CeVe','Region','Organizacion','Item',
  'ShortName','LongName','Price','TrayCapacity','ContainerCapacity','DaysLife','Brand','CategoryItem',
  'Fecha_Venta','Fecha_Proceso','Dia_Semana','LeadTime','FrecuenciaDias','Fecha_Venta_Origen',
  'Cantidad','Existencia_manual_pzs','Existencia_manual_env',
  'Fecha_Transito1','Pedido_Fabrica1','CargoPromedio_Transito1','Existencia_teorica_1',
  'Fecha_Transito2','Pedido_Fabrica2','CargoPromedio_Transito2','Existencia_teorica_2',
  'Fecha_Transito3','Pedido_Fabrica3','CargoPromedio_Transito3','Existencia_teorica_3',
  'Fecha_Transito4','Pedido_Fabrica4','CargoPromedio_Transito4','Existencia_teorica_4',
  'Fecha_Transito5','Pedido_Fabrica5','CargoPromedio_Transito5','Existencia_teorica_5',
  'Fecha_Transito6','Pedido_Fabrica6','CargoPromedio_Transito6','Existencia_teorica_6',
  'PromedioFinalPedido','DesviacionStdPedido','Estadistico','Stock_Seguridad',
  'Inventario_Optimo','Reposicion','Diferencia_Pedido_Fabrica',
]

const PAGE_SIZE = 100

export default function ExistenciaTeorica() {
  const today = new Date().toISOString().slice(0, 10)
  const [fechaSel, setFechaSel]     = useState(today)
  const [running, setRunning]       = useState(false)
  const [estado, setEstado]         = useState(null)
  const [result, setResult]         = useState(null)
  const [historial, setHistorial]   = useState([])
  const [loadingH, setLoadingH]     = useState(true)
  const [ejecucionId, setEjecucionId] = useState(null)
  const [datos, setDatos]           = useState(null)
  const [loadingD, setLoadingD]     = useState(false)
  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [searchInp, setSearchInp]   = useState('')
  const pollRef = useRef(null)

  async function loadHistorial() {
    setLoadingH(true)
    try {
      const r = await fetch(`${API}/api/existencia-teorica/historial`)
      if (r.ok) setHistorial(await r.json())
    } catch {}
    finally { setLoadingH(false) }
  }

  async function loadDatos(ejId, p = 1, s = '') {
    if (!ejId) return
    setLoadingD(true)
    try {
      const params = new URLSearchParams({ ejecucionId: ejId, page: p, pageSize: PAGE_SIZE, ...(s ? { search: s } : {}) })
      const r = await fetch(`${API}/api/existencia-teorica/resultados?${params}`)
      if (r.ok) setDatos(await r.json())
    } catch {}
    finally { setLoadingD(false) }
  }

  async function checkEstado() {
    try {
      const r = await fetch(`${API}/api/existencia-teorica/estado`)
      if (!r.ok) return
      const d = await r.json()
      setEstado(d)
      if (d.estado === 'completado' || d.estado === 'error') {
        clearInterval(pollRef.current)
        setRunning(false)
        if (d.estado === 'completado') {
          setResult({ ok: true, d: d.resultado })
          setEjecucionId(d.resultado?.ejecucionId)
          setPage(1); setSearch(''); setSearchInp('')
          loadDatos(d.resultado?.ejecucionId, 1, '')
        } else {
          setResult({ ok: false, msg: d.error })
        }
        loadHistorial()
      }
    } catch {}
  }

  useEffect(() => {
    loadHistorial()
    checkEstado().then(() => {
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
    if (!fechaSel) return
    if (!confirm(`¿Ejecutar existencia teórica para la fecha de venta ${fechaSel}? Esto reemplaza los resultados si ya existía una ejecución igual.`)) return

    setRunning(true); setResult(null)
    try {
      const r = await fetch(`${API}/api/existencia-teorica/ejecutar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaSel, usuario: 'axel.rojas' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`)
      pollRef.current = setInterval(checkEstado, 3000)
    } catch (e) {
      setRunning(false)
      setResult({ ok: false, msg: e.message })
    }
  }

  function handleSearch(e) {
    e.preventDefault()
    setSearch(searchInp)
    setPage(1)
    loadDatos(ejecucionId, 1, searchInp)
  }

  function changePage(p) {
    setPage(p)
    loadDatos(ejecucionId, p, search)
  }

  function verEjecucion(ejId) {
    setEjecucionId(ejId)
    setPage(1); setSearch(''); setSearchInp('')
    loadDatos(ejId, 1, '')
  }

  const totalPages = datos ? Math.ceil(datos.total / PAGE_SIZE) : 1

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
          Existencia Teórica
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
          Simulación de inventario: existencia manual, tránsitos (saltando domingo), cargo promedio y proyección de existencia teórica día a día.
        </p>
      </div>

      {/* Parámetros de ejecución */}
      <div style={{
        background: '#f8faff', border: '1px solid #c7d7fd', borderRadius: 14,
        padding: '22px 24px', marginBottom: 28,
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e3a8a', marginBottom: 16 }}>
          Parámetros de ejecución
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: '#374151' }}>
            Fecha de venta (Fecha_Sel)
            <input type="date" value={fechaSel} disabled={running}
              onChange={e => setFechaSel(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }} />
          </label>
          <div style={{ fontSize: 12, color: '#6b7280', paddingBottom: 8 }}>
            Fecha de proceso (existencia física) se calcula automático: 7 días antes.
          </div>
          <button className="btn primary" onClick={handleEjecutar}
            disabled={running || !fechaSel}
            style={{ padding: '9px 28px', fontWeight: 700, fontSize: 14, height: 38 }}>
            {running ? '⏳ Ejecutando…' : '▶ Ejecutar'}
          </button>
        </div>

        {running && (
          <div style={{ marginTop: 16, fontSize: 13, color: '#1d4ed8' }}>
            ⏳ Calculando existencia teórica… esto puede tardar un momento.
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
              ? `✓ Ejecución completada — ${result.d?.totalFilas?.toLocaleString() ?? 0} filas en ${fmtDur(result.d?.duracionMs)} (Fecha_Proceso: ${result.d?.fechaProceso?.slice(0,10) ?? '—'})`
              : `✕ ${result.msg}`}
          </div>
        )}
      </div>

      {/* Historial */}
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 12 }}>
        Historial de ejecuciones
      </div>
      {loadingH ? (
        <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 24 }}>Cargando historial…</div>
      ) : historial.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 24 }}>
          Sin ejecuciones registradas aún.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 32 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Fecha venta','Fecha proceso','Ejecutado por','Ejecutado el','Duración','Filas','Estado',''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                    color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historial.map((row, i) => {
                const dt = row.ejecutadoEl ? new Date(row.ejecutadoEl) : null
                const enCurso = row.estado === 'ejecutando'
                return (
                  <tr key={row.ejecucionId ?? i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '9px 14px' }}>{row.fechaSel}</td>
                    <td style={{ padding: '9px 14px' }}>{row.fechaProceso}</td>
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
                    <td style={{ padding: '9px 14px' }}>
                      {row.estado === 'OK' && (
                        <button onClick={() => verEjecucion(row.ejecucionId)}
                          style={{ background: 'none', border: '1px solid #93b4fd', borderRadius: 6,
                            color: '#1d4ed8', cursor: 'pointer', padding: '3px 10px', fontSize: 12 }}>
                          Ver resultados
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Resultados de la ejecución seleccionada */}
      {ejecucionId && (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 12 }}>
            Resultados — ejecución {ejecucionId.slice(0, 8)}…
          </div>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              value={searchInp}
              onChange={e => setSearchInp(e.target.value)}
              placeholder="Buscar por CeVe o Item…"
              style={{ flex: 1, maxWidth: 320, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
                fontSize: 13, background: '#fff', outline: 'none' }}
            />
            <button type="submit" className="btn primary" style={{ padding: '8px 20px', fontSize: 13 }}>Buscar</button>
            {datos && <span style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>{datos.total.toLocaleString()} registros</span>}
          </form>

          {loadingD ? (
            <div style={{ color: '#9ca3af', fontSize: 13 }}>Cargando resultados…</div>
          ) : !datos || datos.total === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 14,
              border: '1px dashed var(--border)', borderRadius: 12 }}>
              Sin resultados para esta ejecución.
            </div>
          ) : (
            <>
              <div className="table-wrap" style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {RESULT_COLS.map(c => (
                        <th key={c} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600,
                          color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#f9fafb' }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datos.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        {RESULT_COLS.map(c => (
                          <td key={c} style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                            {r[c] === null || r[c] === undefined ? <span style={{ color: '#d1d5db' }}>—</span> : String(r[c])}
                          </td>
                        ))}
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
      )}
    </div>
  )
}
