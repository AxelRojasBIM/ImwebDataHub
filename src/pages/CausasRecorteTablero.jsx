import { useState, useEffect, useCallback, Fragment } from 'react'
import { API } from '../App'

const CAUSA_STYLES = {
  'Recorte Fabrica':                  { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  'Consumo arriba del promedio':      { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  'Sin causa identificada':           { bg: '#f3f4f6', border: '#e5e7eb', text: '#4b5563' },
  'Producto sin planeación en torre': { bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6' },
}
const CAUSA_OPTS = Object.keys(CAUSA_STYLES)

function CausaBadge({ causa, small }) {
  if (!causa) return <span style={{ color: '#9ca3af' }}>—</span>
  const s = CAUSA_STYLES[causa] || CAUSA_STYLES['Sin causa identificada']
  return (
    <span style={{
      display: 'inline-block', padding: small ? '1px 8px' : '3px 10px', borderRadius: 99,
      fontSize: small ? 11 : 12, fontWeight: 600,
      background: s.bg, border: `1px solid ${s.border}`, color: s.text,
      whiteSpace: 'nowrap',
    }}>{causa}</span>
  )
}

function fmtNum(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 })
}
function fmtUsd(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const PAGE_SIZE = 50

export default function CausasRecorteTablero() {
  const [filtros, setFiltros] = useState({ ceves: [], canales: [] })
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin]       = useState('')
  const [codigoCeve, setCodigoCeve]   = useState('')
  const [canal, setCanal]             = useState('')
  const [causa, setCausa]             = useState('')
  const [page, setPage]               = useState(1)

  const [data, setData]       = useState({ total: 0, totalRecortePzs: 0, totalRecorteUsd: 0, rows: [] })
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    fetch(`${API}/api/causas-recorte/filtros`)
      .then(r => r.ok ? r.json() : { ceves: [], canales: [] })
      .then(setFiltros)
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (fechaInicio) params.set('fechaInicio', fechaInicio)
      if (fechaFin)    params.set('fechaFin', fechaFin)
      if (codigoCeve)  params.set('codigoCeve', codigoCeve)
      if (canal)       params.set('canal', canal)
      if (causa)       params.set('causa', causa)
      const r = await fetch(`${API}/api/causas-recorte/tablero?${params}`)
      if (r.ok) setData(await r.json())
    } catch {}
    finally { setLoading(false) }
  }, [page, fechaInicio, fechaFin, codigoCeve, canal, causa])

  useEffect(() => { load() }, [load])

  function handleFiltrar() {
    setPage(1)
    load()
  }
  function handleLimpiar() {
    setFechaInicio(''); setFechaFin(''); setCodigoCeve(''); setCanal(''); setCausa(''); setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
          Causas Recorte
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
          Detalle de recortes con la causa diagnosticada (Recorte Fábrica vs. Consumo arriba del promedio).
        </p>
      </div>

      {/* Filtros */}
      <div style={{
        background: '#f8faff', border: '1px solid #c7d7fd', borderRadius: 14,
        padding: '18px 22px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Desde
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Hasta
            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            CeVe
            <select value={codigoCeve} onChange={e => setCodigoCeve(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 160 }}>
              <option value="">Todos</option>
              {filtros.ceves.map(c => <option key={c.codigoCeve} value={c.codigoCeve}>{c.ceve}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Canal
            <select value={canal} onChange={e => setCanal(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 140 }}>
              <option value="">Todos</option>
              {filtros.canales.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }}>
            Causa
            <select value={causa} onChange={e => setCausa(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 220 }}>
              <option value="">Todas</option>
              {CAUSA_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button className="btn primary" onClick={handleFiltrar}
            style={{ padding: '8px 22px', fontWeight: 700, fontSize: 13, height: 36 }}>
            Filtrar
          </button>
          <button onClick={handleLimpiar}
            style={{ padding: '8px 16px', height: 36, fontSize: 13, borderRadius: 8, background: '#fff',
              border: '1px solid var(--border)', color: '#6b7280', cursor: 'pointer' }}>
            Limpiar
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 160 }}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Filas</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{data.total.toLocaleString()}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 160 }}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Recorte total (Pzs)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#991b1b' }}>{fmtNum(data.totalRecortePzs)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 160 }}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Recorte total ($)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#991b1b' }}>{fmtUsd(data.totalRecorteUsd)}</div>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '24px 0' }}>Cargando…</div>
      ) : data.rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 12 }}>
          Sin resultados para estos filtros.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Fecha','CeVe','Item','Producto','Canal','Recorte Pzs','Recorte $','Causa Principal','Causa Secundaria',''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                      color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => {
                  const key = `${row.codigoCeve}-${row.item}-${row.fechaVenta}-${row.canal}-${i}`
                  const isOpen = expanded === key
                  return (
                    <Fragment key={key}>
                      <tr style={{ borderBottom: isOpen ? 'none' : '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{row.fechaVenta}</td>
                        <td style={{ padding: '9px 14px' }}>{row.ceve || row.codigoCeve}</td>
                        <td style={{ padding: '9px 14px' }}>{row.item}</td>
                        <td style={{ padding: '9px 14px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.descripcion}>
                          {row.descripcion || '—'}
                        </td>
                        <td style={{ padding: '9px 14px' }}>{row.canal || '—'}</td>
                        <td style={{ padding: '9px 14px', fontWeight: 600, textAlign: 'right' }}>{fmtNum(row.recortePzs)}</td>
                        <td style={{ padding: '9px 14px', fontWeight: 600, textAlign: 'right' }}>{fmtUsd(row.recorteUsd)}</td>
                        <td style={{ padding: '9px 14px' }}><CausaBadge causa={row.causaPrincipal} /></td>
                        <td style={{ padding: '9px 14px' }}><CausaBadge causa={row.causaSecundaria} small /></td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                          {row.resumen && (
                            <button onClick={() => setExpanded(isOpen ? null : key)}
                              style={{ background: 'none', border: '1px solid #93b4fd', borderRadius: 6,
                                color: '#1d4ed8', cursor: 'pointer', padding: '3px 10px', fontSize: 12 }}>
                              {isOpen ? 'Ocultar' : 'Resumen'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td colSpan={10} style={{ padding: '0 14px 12px', fontSize: 12.5, color: '#4b5563', lineHeight: 1.5 }}>
                            {row.resumen}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: 13, color: '#6b7280' }}>
            <div>Página {page} de {totalPages} · {data.total.toLocaleString()} filas</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff',
                  cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>
                ← Anterior
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff',
                  cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}>
                Siguiente →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
