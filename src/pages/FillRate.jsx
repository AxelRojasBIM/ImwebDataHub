import { useState, useEffect } from 'react'
import { API } from '../App'

function fmtDT(val) {
  if (!val) return '—'
  return String(val).slice(0, 19).replace('T', ' ')
}

function fmtDur(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function FillRate() {
  const today = new Date().toISOString().slice(0, 10)
  const [fechaInicio, setFechaInicio] = useState(today)
  const [fechaFin, setFechaFin]       = useState(today)
  const [running, setRunning]         = useState(false)
  const [result, setResult]           = useState(null)
  const [historial, setHistorial]     = useState([])
  const [loadingH, setLoadingH]       = useState(true)

  async function loadHistorial() {
    setLoadingH(true)
    try {
      const r = await fetch(`${API}/api/fill-rate/historial`)
      if (r.ok) setHistorial(await r.json())
    } catch {}
    finally { setLoadingH(false) }
  }

  useEffect(() => { loadHistorial() }, [])

  async function handleEjecutar() {
    if (!fechaInicio || !fechaFin) return
    if (fechaFin < fechaInicio) { alert('La fecha fin no puede ser anterior a la fecha inicio.'); return }
    if (!confirm(`¿Ejecutar Fill Rate del ${fechaInicio} al ${fechaFin}?`)) return

    setRunning(true); setResult(null)
    try {
      const r = await fetch(`${API}/api/fill-rate/ejecutar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaInicio, fechaFin, usuario: 'axel.rojas' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`)
      setResult({ ok: true, d })
      await loadHistorial()
    } catch (e) {
      setResult({ ok: false, msg: e.message })
    } finally { setRunning(false) }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
          Fill Rate Planta/Cedis a CeVe
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
          Selecciona el rango de fechas y ejecuta el proceso para calcular el Fill Rate.
        </p>
      </div>

      {/* Panel de ejecución */}
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
            <input
              type="date"
              value={fechaInicio}
              max={today}
              onChange={e => setFechaInicio(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
                fontSize: 13, outline: 'none', background: '#fff',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: '#374151' }}>
            Fecha fin
            <input
              type="date"
              value={fechaFin}
              max={today}
              onChange={e => setFechaFin(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
                fontSize: 13, outline: 'none', background: '#fff',
              }}
            />
          </label>

          <button
            className="btn primary"
            onClick={handleEjecutar}
            disabled={running || !fechaInicio || !fechaFin}
            style={{ padding: '9px 28px', fontWeight: 700, fontSize: 14, height: 38 }}
          >
            {running ? '⏳ Ejecutando…' : '▶ Ejecutar'}
          </button>
        </div>

        {result && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: result.ok ? '#ecfdf5' : '#fef2f2',
            color:      result.ok ? '#065f46'  : '#991b1b',
            border: `1px solid ${result.ok ? '#6ee7b7' : '#fca5a5'}`,
          }}>
            {result.ok
              ? `✓ Ejecución completada — ${result.d.totalCeves ?? 0} CeVes encontrados en ${fmtDur(result.d.duracionMs)}`
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
        <div style={{
          textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14,
          border: '1px dashed var(--border)', borderRadius: 12,
        }}>
          Sin ejecuciones registradas aún.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Fecha inicio','Fecha fin','Ejecutado por','Ejecutado el','Hora','Duración','CeVes encontrados','Estado'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                    color: '#374151', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historial.map((row, i) => {
                const fechaHora = row.ejecutadoEl ? new Date(row.ejecutadoEl) : null
                const fecha = fechaHora ? fechaHora.toLocaleDateString('es-MX') : '—'
                const hora  = fechaHora ? fechaHora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
                return (
                  <tr key={row.id ?? i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '9px 14px' }}>{row.fechaInicio?.slice(0, 10) ?? '—'}</td>
                    <td style={{ padding: '9px 14px' }}>{row.fechaFin?.slice(0, 10) ?? '—'}</td>
                    <td style={{ padding: '9px 14px' }}>{row.usuario ?? '—'}</td>
                    <td style={{ padding: '9px 14px' }}>{fecha}</td>
                    <td style={{ padding: '9px 14px' }}>{hora}</td>
                    <td style={{ padding: '9px 14px' }}>{fmtDur(row.duracionMs)}</td>
                    <td style={{ padding: '9px 14px', fontWeight: 600 }}>{row.totalCeves ?? 0}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                        background: row.estado === 'OK' ? '#dcfce7' : '#fef2f2',
                        color:      row.estado === 'OK' ? '#166534' : '#991b1b',
                      }}>
                        {row.estado ?? '—'}
                      </span>
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
