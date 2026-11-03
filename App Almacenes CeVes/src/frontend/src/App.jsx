import { useEffect, useState } from 'react'

const CEVES_COLS = [
  ['codCeve', 'Cod. CeVe'], ['nombre', 'Nombre'], ['region', 'Región'], ['organizacion', 'Organización'],
  ['areaNegocio', 'Área Negocio'], ['gerente', 'Gerente'], ['subgerente', 'Subgerente'],
  ['coordinador', 'Coordinador'], ['turnoLaboral', 'Turno'],
]

// Mismo orden de secciones y de items que el menú principal de la app en
// Azure (Ejecución Proceso / Cargas masivas / Catálogos), para que a nadie
// le cueste encontrar algo porque "aquí está en otro lado". Las pantallas
// que aún no se migran (Promedios de Pedido, Frecuencias Producto CeVes)
// simplemente no aparecen todavía — se insertan en su lugar cuando se migren.
const CATALOGOS = [
  // ── Ejecución Proceso ── (Post-Mortem, Existencia Teórica y Causas Recorte
  // quedan pendientes — ver nota en el chat)
  { key: 'fill-rate', label: 'Fill Rate Planta/Cedis a CeVe', fuente: 'Fill Rate', carpeta: 'Procesos/FillRate/Remisiones (+ catálogos)', section: 'Ejecución Proceso', proceso: true },
  // ── Cargas masivas ──
  { key: 'pedido-ceve-planta', label: 'Pedido CeVe a Planta/Cedis', fuente: 'Pedido CeVe a Planta/Cedis', carpeta: 'Cargas/PedidoCevePlanta', section: 'Cargas masivas' },
  { key: 'pedido-oracle', label: 'Pedido Oracle', fuente: 'Pedido Oracle', carpeta: 'Cargas/PedidoOracle', section: 'Cargas masivas' },
  { key: 'participacion-tipo-movimiento', label: 'Participación - Tipo Movimiento', fuente: 'Participación - Tipo Movimiento', carpeta: 'Cargas/ParticipacionTipoMovimiento', section: 'Cargas masivas' },
  { key: 'existencia-ceve-manual', label: 'Existencia CeVe Manual', fuente: 'Existencia CeVe Manual', carpeta: 'Cargas/ExistenciaCeveManual', section: 'Cargas masivas' },
  { key: 'pedido-vs-cargo-real', label: 'PedidoVSCargo Real', fuente: 'PedidoVSCargo Real', carpeta: 'Cargas/PedidoVsCargoReal', section: 'Cargas masivas' },
  // ── Catálogos ──
  { key: 'ceves', label: 'CeVes', fuente: 'CEVEs', carpeta: 'Catalogos/CEVEs', section: 'Catálogos' },
  { key: 'productos-hub', label: 'Productos HubPedidos', fuente: 'Productos HubPedidos', carpeta: 'Catalogos/ProductosHubPedidos', section: 'Catálogos' },
  { key: 'rtm', label: 'Productos RTM', fuente: 'Productos RTM', carpeta: 'Catalogos/ProductosHubPedidos/RTM', section: 'Catálogos' },
  { key: 'calendario', label: 'Calendario', fuente: 'Calendario', carpeta: 'Catalogos/Calendario', section: 'Catálogos' },
  { key: 'oracle-ceves', label: 'Catálogo CeVes Oracle', fuente: 'Catálogo CeVes Oracle', carpeta: 'Catalogos/CatalogosOracle/CeVes', section: 'Catálogos' },
  { key: 'oracle-facilities', label: 'Catálogo Facilities Oracle', fuente: 'Catálogo Destination Facility Oracle', carpeta: 'Catalogos/CatalogosOracle/Facilities', section: 'Catálogos' },
  { key: 'plantas', label: 'Plantas / Cedis', fuente: 'Plantas / Cedis', carpeta: 'Catalogos/Plantas', section: 'Catálogos' },
  { key: 'cadena-suministro', label: 'Catálogo Cadena Suministro', fuente: 'Catálogo Cadena Suministro', carpeta: 'Catalogos/CadenaSuministro', section: 'Catálogos' },
  { key: 'remisiones', label: 'Remisiones (Fill Rate)', fuente: 'Remisiones (Fill Rate)', carpeta: 'Procesos/FillRate/Remisiones', section: 'Catálogos' },
]

const SECCIONES = ['Ejecución Proceso', 'Cargas masivas', 'Catálogos']

function GenericTable({ apiPath }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    setRows(null)
    fetch(apiPath).then(r => r.json()).then(setRows)
  }, [apiPath])

  if (rows === null) return <p>Cargando…</p>
  const cols = rows.length ? Object.keys(rows[0]) : []

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong>{rows.length.toLocaleString('es-MX')} filas</strong>
        <span className={`badge ${rows.length ? 'badge-ok' : 'badge-warn'}`}>
          {rows.length ? 'Catálogo cargado' : 'Sin datos todavía'}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{cols.map(c => <td key={c}>{r[c] ?? ''}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function CevesTable() {
  const [ceves, setCeves] = useState(null)
  useEffect(() => { fetch('/api/ceves/actuales').then(r => r.json()).then(setCeves) }, [])
  if (ceves === null) return <p>Cargando…</p>
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong>{ceves.length} CeVes</strong>
        <span className={`badge ${ceves.length ? 'badge-ok' : 'badge-warn'}`}>
          {ceves.length ? 'Catálogo cargado' : 'Sin datos — deposita un CSV en Datos/Catalogos/CEVEs'}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>{CEVES_COLS.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
          <tbody>
            {ceves.map(c => (
              <tr key={c.codCeve}>{CEVES_COLS.map(([k]) => <td key={k}>{c[k]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const API_PATHS = {
  'productos-hub': '/api/catalogos/productos-hub',
  rtm: '/api/catalogos/rtm',
  calendario: '/api/catalogos/calendario',
  'oracle-ceves': '/api/catalogos/oracle-ceves',
  'oracle-facilities': '/api/catalogos/oracle-facilities',
  plantas: '/api/catalogos/plantas',
  'pedido-ceve-planta': '/api/cargas/pedido-ceve-planta',
  'pedido-oracle': '/api/cargas/pedido-oracle',
  'existencia-ceve-manual': '/api/cargas/existencia-ceve-manual',
  'pedido-vs-cargo-real': '/api/cargas/pedido-vs-cargo-real',
  'participacion-tipo-movimiento': '/api/cargas/participacion-tipo-movimiento',
  'cadena-suministro': '/api/catalogos/cadena-suministro',
  remisiones: '/api/cargas/remisiones',
}

function todayIso() { return new Date().toISOString().slice(0, 10) }

function FillRatePage() {
  const [fechaInicio, setFechaInicio] = useState(todayIso())
  const [fechaFin, setFechaFin] = useState(todayIso())
  const [ejecutando, setEjecutando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [resultados, setResultados] = useState(null)
  const [estado, setEstado] = useState(null)

  async function cargarEstado() {
    const r = await fetch('/api/procesos/fill-rate/estado')
    setEstado(await r.json().catch(() => null))
  }
  async function cargarResultados() {
    const r = await fetch('/api/procesos/fill-rate/resultados')
    setResultados(await r.json())
  }
  useEffect(() => { cargarEstado(); cargarResultados() }, [])

  async function handleEjecutar() {
    setEjecutando(true); setMensaje(null)
    try {
      const r = await fetch('/api/procesos/fill-rate/ejecutar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaInicio, fechaFin }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || data.detail || 'Error al ejecutar')
      setMensaje(`Listo: ${data.filas.toLocaleString('es-MX')} filas (${data.fechaInicio} a ${data.fechaFin}).`)
      await cargarEstado(); await cargarResultados()
    } catch (e) {
      setMensaje('Error: ' + e.message)
    } finally {
      setEjecutando(false)
    }
  }

  const cols = resultados?.length ? Object.keys(resultados[0]) : []

  return (
    <>
      <div className="card">
        <strong>Ejecutar Fill Rate</strong>
        <p style={{ fontSize: 12.5, color: '#6b7280', margin: '6px 0 14px' }}>
          Compara Pedido CeVe a Planta/Cedis contra Remisiones (embarques) en el rango de fechas,
          y calcula Recorte/Aumento en envases, piezas e importe.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12.5 }}>
            Desde<br />
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
          </label>
          <label style={{ fontSize: 12.5 }}>
            Hasta<br />
            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </label>
          <button onClick={handleEjecutar} disabled={ejecutando}>{ejecutando ? 'Ejecutando…' : 'Ejecutar'}</button>
        </div>
        {estado?.filas != null && (
          <div className="mono" style={{ marginTop: 10 }}>
            Última ejecución: {estado.detalle} — {Number(estado.filas).toLocaleString('es-MX')} filas ({estado.ejecutadoEn?.slice(0, 16).replace('T', ' ')})
          </div>
        )}
        {mensaje && <p>{mensaje}</p>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong>Resultados{resultados ? ` (${resultados.length.toLocaleString('es-MX')})` : ''}</strong>
        </div>
        {resultados === null ? <p>Cargando…</p> : resultados.length === 0 ? <p>Sin resultados — ejecuta Fill Rate para un rango de fechas.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {resultados.map((r, i) => (
                  <tr key={i}>{cols.map(c => <td key={c}>{r[c] ?? ''}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

export default function App() {
  const [tab, setTab] = useState('ceves')
  const [estado, setEstado] = useState(null)
  const [recargando, setRecargando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  async function cargarEstado() {
    const r = await fetch('/api/datos/estado')
    setEstado(await r.json())
  }

  useEffect(() => { cargarEstado() }, [])

  async function handleRecargar() {
    setRecargando(true); setMensaje(null)
    try {
      const r = await fetch('/api/datos/recargar', { method: 'POST' })
      const resultados = await r.json()
      setMensaje(resultados.map(x => x.mensaje).join(' · '))
      await cargarEstado()
      setRefreshKey(k => k + 1)
    } catch (e) {
      setMensaje('Error al recargar: ' + e.message)
    } finally {
      setRecargando(false)
    }
  }

  const activo = CATALOGOS.find(c => c.key === tab)
  const estadoFuente = estado?.fuentes?.find(f => f.fuente === activo?.fuente)

  return (
    <>
      <div className="topbar">
        <h1>App Almacenes CeVes</h1>
        <p>Catálogos — datos cargados desde la carpeta Datos/ (CSV)</p>
      </div>

      <div style={{ display: 'flex' }}>
        <div style={{ width: 240, background: '#fff', borderRight: '1px solid #e5e7eb', minHeight: 'calc(100vh - 64px)', paddingBottom: 20 }}>
          {SECCIONES.map(sec => {
            const items = CATALOGOS.filter(c => c.section === sec)
            if (items.length === 0) return null
            return (
              <div key={sec}>
                <div style={{ padding: '16px 18px 6px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#9ca3af', textTransform: 'uppercase' }}>
                  {sec}
                </div>
                {items.map(c => (
                  <div key={c.key} onClick={() => setTab(c.key)} style={{
                    padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: tab === c.key ? 700 : 500,
                    background: tab === c.key ? '#eff6ff' : 'transparent', color: tab === c.key ? '#2563eb' : '#374151',
                    borderLeft: tab === c.key ? '3px solid #2563eb' : '3px solid transparent',
                  }}>
                    {c.label}
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        <div className="content" style={{ flex: 1 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: activo?.proceso ? 0 : 10 }}>
              <strong>{activo?.proceso ? 'Datos de entrada' : `Estado de carga — ${activo?.label}`}</strong>
              <button onClick={handleRecargar} disabled={recargando}>
                {recargando ? 'Recargando…' : 'Recargar datos'}
              </button>
            </div>
            {!activo?.proceso && (
              <div className="mono">
                Archivo esperado en: Datos/{activo?.carpeta}/*.csv
                {estadoFuente && <> — último cargado: {estadoFuente.archivo} ({estadoFuente.filas.toLocaleString('es-MX')} filas, {estadoFuente.cargadoEn?.slice(0, 16).replace('T', ' ')})</>}
              </div>
            )}
            {mensaje && <p>{mensaje}</p>}
          </div>

          {activo?.proceso ? (
            <FillRatePage key={refreshKey} />
          ) : (
            <div className="card" key={refreshKey}>
              {tab === 'ceves' ? <CevesTable /> : <GenericTable apiPath={API_PATHS[tab]} />}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
