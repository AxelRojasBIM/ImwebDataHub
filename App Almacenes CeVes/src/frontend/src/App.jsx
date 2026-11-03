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
  { key: 'existencia-teorica', label: 'Existencia Teórica', fuente: 'Existencia Teórica', carpeta: 'Catalogos/PromediosPedido, FrecuenciasProductoCeves, Cargas/InventarioResumen', section: 'Ejecución Proceso', proceso: true },
  { key: 'post-mortem', label: 'Post-Mortem', fuente: 'Post-Mortem', carpeta: '(usa Existencia Teórica + Fill Rate + PedidoVSCargo Real ya cargados)', section: 'Ejecución Proceso', proceso: true },
  { key: 'inventario-optimo', label: 'Cálculo Inventario Óptimo', fuente: 'Cálculo Inventario Óptimo', carpeta: 'Procesos/InventarioOptimo', section: 'Ejecución Proceso', proceso: true },
  { key: 'causas-recorte', label: 'Causas Recorte', fuente: 'Causas Recorte', carpeta: 'Procesos/CausasRecorte', section: 'Ejecución Proceso', proceso: true },
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
  { key: 'promedios-pedido', label: 'Promedios de Pedido (Synapse)', fuente: 'Promedios de Pedido (Synapse)', carpeta: 'Catalogos/PromediosPedido', section: 'Catálogos' },
  { key: 'frecuencias-producto-ceves', label: 'Frecuencias Producto CeVes (OrderTower)', fuente: 'Frecuencias Producto CeVes (OrderTower)', carpeta: 'Catalogos/FrecuenciasProductoCeves', section: 'Catálogos' },
  { key: 'inventario-resumen', label: 'Inventario Resumen (Ivy)', fuente: 'Inventario Resumen (Ivy)', carpeta: 'Cargas/InventarioResumen', section: 'Catálogos' },
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
  'promedios-pedido': '/api/catalogos/promedios-pedido',
  'frecuencias-producto-ceves': '/api/catalogos/frecuencias-producto-ceves',
  'inventario-resumen': '/api/cargas/inventario-resumen',
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

function ExistenciaTeoricaPage() {
  const [fechaSel, setFechaSel] = useState(todayIso())
  const [baseExistencia, setBaseExistencia] = useState('Aut')
  const [ejecutando, setEjecutando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [resultados, setResultados] = useState(null)
  const [fechas, setFechas] = useState([])
  const [fechaVer, setFechaVer] = useState('')

  async function cargarFechas() {
    const r = await fetch('/api/procesos/existencia-teorica/fechas')
    setFechas(await r.json())
  }
  async function cargarResultados(fecha) {
    const url = fecha ? `/api/procesos/existencia-teorica/resultados?fecha=${fecha}` : '/api/procesos/existencia-teorica/resultados'
    const r = await fetch(url)
    const data = await r.json()
    setResultados(data)
    if (data.length && !fecha) setFechaVer(data[0].Fecha_Venta)
  }
  useEffect(() => { cargarFechas(); cargarResultados() }, [])

  async function handleEjecutar() {
    setEjecutando(true); setMensaje(null)
    try {
      const r = await fetch('/api/procesos/existencia-teorica/ejecutar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaSel, baseExistencia }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || data.detail || 'Error al ejecutar')
      setMensaje(`Listo: ${data.filas.toLocaleString('es-MX')} filas para ${data.fechaSel}.`)
      await cargarFechas(); setFechaVer(data.fechaSel); await cargarResultados(data.fechaSel)
    } catch (e) {
      setMensaje('Error: ' + e.message)
    } finally {
      setEjecutando(false)
    }
  }

  async function handleVerFecha(f) {
    setFechaVer(f)
    await cargarResultados(f)
  }

  const cols = resultados?.length ? Object.keys(resultados[0]) : []

  return (
    <>
      <div className="card">
        <strong>Ejecutar Existencia Teórica</strong>
        <p style={{ fontSize: 12.5, color: '#6b7280', margin: '6px 0 14px' }}>
          Calcula cuánta existencia habrá en los próximos 6 días hábiles de tránsito, a partir de lo
          pedido, la existencia física actual y el promedio histórico de pedido por CeVe+Item.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12.5 }}>
            Fecha de venta<br />
            <input type="date" value={fechaSel} onChange={e => setFechaSel(e.target.value)} />
          </label>
          <label style={{ fontSize: 12.5 }}>
            Existencia base<br />
            <select value={baseExistencia} onChange={e => setBaseExistencia(e.target.value)}>
              <option value="Aut">Automática (Inventario Resumen / Ivy)</option>
              <option value="Man">Manual (Existencia CeVe Manual)</option>
            </select>
          </label>
          <button onClick={handleEjecutar} disabled={ejecutando}>{ejecutando ? 'Ejecutando…' : 'Ejecutar'}</button>
        </div>
        {mensaje && <p>{mensaje}</p>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
          <strong>Resultados{resultados ? ` (${resultados.length.toLocaleString('es-MX')})` : ''}</strong>
          {fechas.length > 0 && (
            <label style={{ fontSize: 12.5 }}>
              Ver ejecución de: {' '}
              <select value={fechaVer} onChange={e => handleVerFecha(e.target.value)}>
                {fechas.map(f => <option key={f.fechaSel} value={f.fechaSel}>{f.fechaSel} ({f.baseExistencia}, {f.filas} filas)</option>)}
              </select>
            </label>
          )}
        </div>
        {resultados === null ? <p>Cargando…</p> : resultados.length === 0 ? <p>Sin resultados — ejecuta Existencia Teórica para una fecha.</p> : (
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

function PostMortemPage() {
  const [fechaVenta, setFechaVenta] = useState(todayIso())
  const [ejecutando, setEjecutando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [resultados, setResultados] = useState(null)
  const [fechas, setFechas] = useState([])
  const [fechaVer, setFechaVer] = useState('')

  async function cargarFechas() {
    const r = await fetch('/api/procesos/post-mortem/fechas')
    setFechas(await r.json())
  }
  async function cargarResultados(fecha) {
    const url = fecha ? `/api/procesos/post-mortem/resultados?fecha=${fecha}` : '/api/procesos/post-mortem/resultados'
    const r = await fetch(url)
    const data = await r.json()
    setResultados(data)
    if (data.length && !fecha) setFechaVer(data[0].Fecha_Venta)
  }
  useEffect(() => { cargarFechas(); cargarResultados() }, [])

  async function handleEjecutar() {
    setEjecutando(true); setMensaje(null)
    try {
      const r = await fetch('/api/procesos/post-mortem/ejecutar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaVenta }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || data.detail || 'Error al ejecutar')
      setMensaje(`Listo: ${data.filas.toLocaleString('es-MX')} filas para ${data.fechaVenta}.`)
      await cargarFechas(); setFechaVer(data.fechaVenta); await cargarResultados(data.fechaVenta)
    } catch (e) {
      setMensaje('Error: ' + e.message)
    } finally {
      setEjecutando(false)
    }
  }

  async function handleVerFecha(f) {
    setFechaVer(f)
    await cargarResultados(f)
  }

  const cols = resultados?.length ? Object.keys(resultados[0]) : []

  return (
    <>
      <div className="card">
        <strong>Ejecutar Post-Mortem</strong>
        <p style={{ fontSize: 12.5, color: '#6b7280', margin: '6px 0 14px' }}>
          Compara lo que Existencia Teórica predijo contra lo que realmente pasó (Fill Rate real y
          PedidoVSCargo Real). Necesita que Existencia Teórica ya se haya ejecutado para esa misma fecha.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12.5 }}>
            Fecha de venta<br />
            <input type="date" value={fechaVenta} onChange={e => setFechaVenta(e.target.value)} />
          </label>
          <button onClick={handleEjecutar} disabled={ejecutando}>{ejecutando ? 'Ejecutando…' : 'Ejecutar'}</button>
        </div>
        {mensaje && <p>{mensaje}</p>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
          <strong>Resultados{resultados ? ` (${resultados.length.toLocaleString('es-MX')})` : ''}</strong>
          {fechas.length > 0 && (
            <label style={{ fontSize: 12.5 }}>
              Ver ejecución de: {' '}
              <select value={fechaVer} onChange={e => handleVerFecha(e.target.value)}>
                {fechas.map(f => <option key={f.fechaVenta} value={f.fechaVenta}>{f.fechaVenta} ({f.filas} filas)</option>)}
              </select>
            </label>
          )}
        </div>
        {resultados === null ? <p>Cargando…</p> : resultados.length === 0 ? <p>Sin resultados — ejecuta Post-Mortem para una fecha.</p> : (
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

function InventarioOptimoPage() {
  const [ejecutando, setEjecutando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [resultados, setResultados] = useState(null)
  const [ejecuciones, setEjecuciones] = useState([])
  const [fechaVer, setFechaVer] = useState('')

  async function cargarEjecuciones() {
    const r = await fetch('/api/procesos/inventario-optimo/ejecuciones')
    setEjecuciones(await r.json())
  }
  async function cargarResultados(fecha) {
    const url = fecha ? `/api/procesos/inventario-optimo/resultados?fecha=${fecha}` : '/api/procesos/inventario-optimo/resultados'
    const r = await fetch(url)
    setResultados(await r.json())
  }
  useEffect(() => { cargarEjecuciones(); cargarResultados() }, [])

  async function handleEjecutar() {
    setEjecutando(true); setMensaje(null)
    try {
      const r = await fetch('/api/procesos/inventario-optimo/ejecutar', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || data.detail || 'Error al ejecutar')
      setMensaje(`Listo: ${data.filas.toLocaleString('es-MX')} filas (${data.fechaMin} a ${data.fechaMax}), archivo "${data.archivo}".`)
      await cargarEjecuciones(); setFechaVer(''); await cargarResultados()
    } catch (e) {
      setMensaje('Error: ' + e.message)
    } finally {
      setEjecutando(false)
    }
  }

  async function handleVerFecha(f) {
    setFechaVer(f)
    await cargarResultados(f)
  }

  const cols = resultados?.length ? Object.keys(resultados[0]) : []
  const fechasDisponibles = [...new Set(resultados?.map(r => r.Fecha_venta) ?? [])].sort().reverse()

  return (
    <>
      <div className="card">
        <strong>Ejecutar Cálculo Inventario Óptimo</strong>
        <p style={{ fontSize: 12.5, color: '#6b7280', margin: '6px 0 14px' }}>
          Lee el extracto de existencias depositado en Datos/Procesos/InventarioOptimo (Fecha_venta, SCCode,
          ItemOrg + existencias hoy/ayer por CE/CN) y calcula el Inventario Óptimo por CeVe+Item, cruzando
          contra Productos, Participación - Tipo Movimiento, Promedios de Pedido y Frecuencias Producto CeVes.
        </p>
        <button onClick={handleEjecutar} disabled={ejecutando}>{ejecutando ? 'Ejecutando…' : 'Ejecutar'}</button>
        {ejecuciones.length > 0 && (
          <div className="mono" style={{ marginTop: 10 }}>
            Última ejecución: {ejecuciones[0].Archivo} — {ejecuciones[0].FechaMin} a {ejecuciones[0].FechaMax}
            ({Number(ejecuciones[0].Filas).toLocaleString('es-MX')} filas, {ejecuciones[0].EjecutadoEn?.slice(0, 16).replace('T', ' ')})
          </div>
        )}
        {mensaje && <p>{mensaje}</p>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
          <strong>Resultados{resultados ? ` (${resultados.length.toLocaleString('es-MX')}${!fechaVer ? ', últimas 500' : ''})` : ''}</strong>
          {fechasDisponibles.length > 1 && (
            <label style={{ fontSize: 12.5 }}>
              Filtrar por fecha: {' '}
              <select value={fechaVer} onChange={e => handleVerFecha(e.target.value)}>
                <option value="">Todas (últimas 500)</option>
                {fechasDisponibles.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          )}
        </div>
        {resultados === null ? <p>Cargando…</p> : resultados.length === 0 ? <p>Sin resultados — ejecuta Cálculo Inventario Óptimo primero.</p> : (
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

const CAUSA_STYLES = {
  'Recorte Fabrica': { bg: '#fee2e2', color: '#991b1b' },
  'Recorte por cupo en Tina': { bg: '#dbeafe', color: '#1e40af' },
  'Consumo arriba del promedio': { bg: '#fef3c7', color: '#92400e' },
  'Existencia CeVe': { bg: '#dcfce7', color: '#166534' },
  'Sin Pedido CeVe Últimos 7 días': { bg: '#cffafe', color: '#155e75' },
  'Sin causa identificada': { bg: '#f3f4f6', color: '#4b5563' },
}
const CAUSA_LABELS = { 'Consumo arriba del promedio': 'Consumo de Inventario' }
function estiloCausa(causa) {
  if (!causa) return CAUSA_STYLES['Sin causa identificada']
  if (causa.startsWith('Sin Pedido CeVe')) return CAUSA_STYLES['Sin Pedido CeVe Últimos 7 días']
  return CAUSA_STYLES[causa] || CAUSA_STYLES['Sin causa identificada']
}
function CausaBadge({ causa }) {
  const s = estiloCausa(causa)
  const label = CAUSA_LABELS[causa] || causa || 'Sin causa identificada'
  return <span className="badge" style={{ background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{label}</span>
}

const GROUP_FIELDS = [
  { key: 'fecha', label: 'Fecha' }, { key: 'ceve', label: 'CeVe' }, { key: 'item', label: 'Item' },
  { key: 'categoria', label: 'Categoría' }, { key: 'canal', label: 'Canal' }, { key: 'marca', label: 'Marca' },
]

function FiltrosCausasRecorte({ filtros, setFiltros, opciones }) {
  const campo = (label, key, lista) => (
    <label style={{ fontSize: 12.5 }}>
      {label}{' '}
      <select value={filtros[key]} onChange={e => setFiltros(f => ({ ...f, [key]: e.target.value }))}>
        <option value="">Todos</option>
        {lista?.map(v => <option key={typeof v === 'string' ? v : v.codigoCeve} value={typeof v === 'string' ? v : v.codigoCeve}>
          {typeof v === 'string' ? v : v.ceve}
        </option>)}
      </select>
    </label>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
      <label style={{ fontSize: 12.5 }}>Desde{' '}
        <input type="date" value={filtros.fechaInicio} onChange={e => setFiltros(f => ({ ...f, fechaInicio: e.target.value }))} />
      </label>
      <label style={{ fontSize: 12.5 }}>Hasta{' '}
        <input type="date" value={filtros.fechaFin} onChange={e => setFiltros(f => ({ ...f, fechaFin: e.target.value }))} />
      </label>
      {campo('CeVe', 'codigoCeve', opciones?.ceves)}
      {campo('Región', 'region', opciones?.regiones)}
      {campo('Canal', 'canal', opciones?.canales)}
      {campo('Categoría', 'categoria', opciones?.categorias)}
      {campo('Marca', 'marca', opciones?.marcas)}
      {campo('Causa', 'causa', opciones?.causas)}
      <label style={{ fontSize: 12.5 }}>Item / descripción{' '}
        <input type="text" placeholder="buscar…" value={filtros.item} onChange={e => setFiltros(f => ({ ...f, item: e.target.value }))} style={{ width: 140 }} />
      </label>
    </div>
  )
}

function qs(obj) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null) p.set(k, v)
  return p.toString()
}

function CausasRecortePage() {
  const [ejecutando, setEjecutando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [ejecuciones, setEjecuciones] = useState([])
  const [opciones, setOpciones] = useState(null)
  const [vista, setVista] = useState('detalle')

  const [filtros, setFiltros] = useState({
    fechaInicio: '', fechaFin: '', codigoCeve: '', region: '', canal: '', categoria: '', marca: '', causa: '', item: '',
  })

  async function cargarEjecuciones() {
    const r = await fetch('/api/procesos/causas-recorte/ejecuciones')
    setEjecuciones(await r.json())
  }
  async function cargarOpciones() {
    const r = await fetch('/api/procesos/causas-recorte/filtros')
    setOpciones(await r.json())
  }
  useEffect(() => { cargarEjecuciones(); cargarOpciones() }, [])

  async function handleEjecutar() {
    setEjecutando(true); setMensaje(null)
    try {
      const r = await fetch('/api/procesos/causas-recorte/ejecutar', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || data.detail || 'Error al ejecutar')
      setMensaje(`Listo: ${data.filas.toLocaleString('es-MX')} filas (${data.fechaMin} a ${data.fechaMax}), archivo "${data.archivo}".`)
      await cargarEjecuciones(); await cargarOpciones()
    } catch (e) {
      setMensaje('Error: ' + e.message)
    } finally {
      setEjecutando(false)
    }
  }

  return (
    <>
      <div className="card">
        <strong>Ejecutar Causas Recorte</strong>
        <p style={{ fontSize: 12.5, color: '#6b7280', margin: '6px 0 14px' }}>
          Lee el CSV depositado en Datos/Procesos/CausasRecorte, diagnostica la causa de cada recorte
          (Recorte Fábrica, Recorte por cupo, Consumo arriba del promedio, Existencia CeVe, Sin Pedido CeVe…)
          cruzando contra Post-Mortem, Fill Rate, Promedios de Pedido e Inventario Resumen ya cargados.
        </p>
        <button onClick={handleEjecutar} disabled={ejecutando}>{ejecutando ? 'Ejecutando…' : 'Ejecutar'}</button>
        {ejecuciones.length > 0 && (
          <div className="mono" style={{ marginTop: 10 }}>
            Última ejecución: {ejecuciones[0].Archivo} — {ejecuciones[0].FechaMin} a {ejecuciones[0].FechaMax}
            ({Number(ejecuciones[0].Filas).toLocaleString('es-MX')} filas, {ejecuciones[0].EjecutadoEn?.slice(0, 16).replace('T', ' ')})
          </div>
        )}
        {mensaje && <p>{mensaje}</p>}
      </div>

      <div className="card">
        <FiltrosCausasRecorte filtros={filtros} setFiltros={setFiltros} opciones={opciones} />
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[['detalle', 'Detalle'], ['agrupado', 'Agrupado'], ['topn', 'Top N']].map(([k, label]) => (
            <button key={k} onClick={() => setVista(k)} style={{ background: vista === k ? '#1d4ed8' : '#e5e7eb', color: vista === k ? '#fff' : '#374151' }}>
              {label}
            </button>
          ))}
        </div>
        {vista === 'detalle' && <CausasRecorteDetalle filtros={filtros} />}
        {vista === 'agrupado' && <CausasRecorteAgrupado filtros={filtros} />}
        {vista === 'topn' && <CausasRecorteTopN filtros={filtros} opciones={opciones} />}
      </div>
    </>
  )
}

function CausasRecorteDetalle({ filtros }) {
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('fecha')
  const [sortDir, setSortDir] = useState('desc')
  const pageSize = 100

  useEffect(() => {
    let activo = true
    fetch('/api/procesos/causas-recorte/tablero?' + qs({ ...filtros, page, pageSize, sortBy, sortDir }))
      .then(r => r.json()).then(d => { if (activo) setData(d) })
    return () => { activo = false }
  }, [filtros, page, sortBy, sortDir])

  useEffect(() => { setPage(1) }, [filtros])

  function ordenarPor(campo) {
    if (sortBy === campo) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(campo); setSortDir('desc') }
  }

  if (!data) return <p>Cargando…</p>
  if (data.total === 0) return <p>Sin resultados con estos filtros.</p>
  const totalPaginas = Math.max(1, Math.ceil(data.total / pageSize))

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <strong>{data.total.toLocaleString('es-MX')} filas — Recorte: {Math.round(data.totalRecortePzs).toLocaleString('es-MX')} pzs / ${data.totalRecorteUsd.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>◀</button>
          Página {page} de {totalPaginas}
          <button onClick={() => setPage(p => Math.min(totalPaginas, p + 1))} disabled={page >= totalPaginas}>▶</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[['fecha', 'Fecha'], ['ceve', 'CeVe'], null, ['item', 'Item'], null, null, null, null,
                ['recortePzs', 'Recorte pzs'], null, ['recorteUsd', 'Recorte USD'], null, null].map((c, i) => c
                ? <th key={c[0]} style={{ cursor: 'pointer' }} onClick={() => ordenarPor(c[0])}>{c[1]}{sortBy === c[0] ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                : null)}
              <th>Región</th><th>Descripción</th><th>Categoría</th><th>Marca</th><th>Canal</th>
              <th>Recorte env/res</th><th>Existencia pzs</th><th>Causa</th><th>Resumen</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.fechaVenta}</td><td>{r.ceve}</td><td>{r.item}</td>
                <td>{Math.round(r.recortePzs).toLocaleString('es-MX')}</td>
                <td>{r.recorteUsd.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</td>
                <td>{r.region}</td><td>{r.descripcion}</td><td>{r.categoria}</td><td>{r.marca}</td><td>{r.canal}</td>
                <td>{r.recorteEnv != null ? `${r.recorteEnv} / ${Math.round(r.recorteResiduo)}` : Math.round(r.recorteResiduo ?? 0)}</td>
                <td>{r.existenciaPzs != null ? Math.round(r.existenciaPzs).toLocaleString('es-MX') : ''}</td>
                <td><CausaBadge causa={r.causaPrincipal} /></td>
                <td style={{ whiteSpace: 'normal', maxWidth: 360 }}>{r.resumen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function CausasRecorteAgrupado({ filtros }) {
  const [campos, setCampos] = useState(['fecha', 'ceve'])
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('recortePzs')
  const [sortDir, setSortDir] = useState('desc')
  const pageSize = 50

  function toggleCampo(k) {
    setCampos(cs => cs.includes(k) ? cs.filter(x => x !== k) : [...cs, k])
  }

  useEffect(() => {
    if (campos.length === 0) { setData(null); return }
    let activo = true
    fetch('/api/procesos/causas-recorte/agrupado?' + qs({ ...filtros, groupBy: campos.join(','), page, pageSize, sortBy, sortDir }))
      .then(r => r.json()).then(d => { if (activo) setData(d) })
    return () => { activo = false }
  }, [filtros, campos, page, sortBy, sortDir])

  useEffect(() => { setPage(1) }, [filtros, campos])

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        {GROUP_FIELDS.map(g => (
          <label key={g.key} style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={campos.includes(g.key)} onChange={() => toggleCampo(g.key)} /> {g.label}
          </label>
        ))}
      </div>
      {campos.length === 0 ? <p>Selecciona al menos un campo para agrupar.</p> : !data ? <p>Cargando…</p> : data.error ? <p>{data.error}</p> : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <strong>{data.totalGrupos.toLocaleString('es-MX')} grupos — Recorte: {Math.round(data.totalRecortePzs).toLocaleString('es-MX')} pzs / ${data.totalRecorteUsd.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</strong>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>◀</button>
              Página {page}
              <button onClick={() => setPage(p => p + 1)} disabled={data.rows.length < pageSize}>▶</button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {campos.includes('ceve') && <th>Región</th>}
                  {campos.map(c => <th key={c}>{GROUP_FIELDS.find(g => g.key === c).label}</th>)}
                  <th>Filas</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => { setSortBy('recortePzs'); setSortDir(d => d === 'asc' ? 'desc' : 'asc') }}>Recorte pzs</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => { setSortBy('recorteUsd'); setSortDir(d => d === 'asc' ? 'desc' : 'asc') }}>Recorte USD</th>
                  <th>Causa predominante</th><th>Causa secundaria</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    {campos.includes('ceve') && <td>{r.region}</td>}
                    {campos.map(c => <td key={c}>{r[c]}</td>)}
                    <td>{r.filas}</td>
                    <td>{Math.round(r.recortePzs).toLocaleString('es-MX')}</td>
                    <td>{r.recorteUsd.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</td>
                    <td><CausaBadge causa={r.causaPredominante} /></td>
                    <td>{r.causaSecundaria ? <CausaBadge causa={r.causaSecundaria} /> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

function CausasRecorteTopN({ filtros, opciones }) {
  const [categoria, setCategoria] = useState('')
  const [topProductos, setTopProductos] = useState(10)
  const [topCeves, setTopCeves] = useState(5)
  const [unidad, setUnidad] = useState('pzs')
  const [orden, setOrden] = useState('desc')
  const [data, setData] = useState(null)

  async function buscar() {
    if (!categoria) return
    const params = qs({
      categoria, topProductos, topCeves, unidad, orden,
      fechaInicio: filtros.fechaInicio, fechaFin: filtros.fechaFin, canal: filtros.canal,
      causa: filtros.causa, marca: filtros.marca, region: filtros.region,
    })
    const r = await fetch('/api/procesos/causas-recorte/top-n?' + params)
    setData(await r.json())
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}>
        <label style={{ fontSize: 12.5 }}>Categoría{' '}
          <select value={categoria} onChange={e => setCategoria(e.target.value)}>
            <option value="">Selecciona…</option>
            {opciones?.categorias?.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12.5 }}>Top items{' '}
          <input type="number" min={1} max={100} value={topProductos} onChange={e => setTopProductos(Number(e.target.value))} style={{ width: 60 }} />
        </label>
        <label style={{ fontSize: 12.5 }}>Top CeVes por item{' '}
          <input type="number" min={1} max={50} value={topCeves} onChange={e => setTopCeves(Number(e.target.value))} style={{ width: 60 }} />
        </label>
        <label style={{ fontSize: 12.5 }}>Unidad{' '}
          <select value={unidad} onChange={e => setUnidad(e.target.value)}>
            <option value="pzs">Piezas</option><option value="usd">USD</option>
          </select>
        </label>
        <label style={{ fontSize: 12.5 }}>Orden{' '}
          <select value={orden} onChange={e => setOrden(e.target.value)}>
            <option value="desc">Mayor a menor</option><option value="asc">Menor a mayor</option>
          </select>
        </label>
        <button onClick={buscar} disabled={!categoria}>Buscar</button>
      </div>
      {data && (data.resultado.length === 0 ? <p>Sin resultados.</p> : data.resultado.map((it, i) => (
        <div key={i} className="card" style={{ background: '#f9fafb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <strong>{it.item} — {it.descripcion}</strong>
            <span className="mono">{Math.round(it.totalPzs).toLocaleString('es-MX')} pzs / ${it.totalUsd.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="table-wrap" style={{ marginTop: 10, maxHeight: 280 }}>
            <table>
              <thead><tr><th>CeVe</th><th>Recorte pzs</th><th>Recorte USD</th><th>Causas</th></tr></thead>
              <tbody>
                {it.ceves.map((c, j) => (
                  <tr key={j}>
                    <td>{c.codigoCeve} - {c.ceve}</td>
                    <td>{Math.round(c.totalPzs).toLocaleString('es-MX')}</td>
                    <td>{c.totalUsd.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {c.causas.map((cs, k) => <CausaBadge key={k} causa={cs.causa} />)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )))}
    </>
  )
}

const PROCESO_PAGES = {
  'fill-rate': FillRatePage,
  'existencia-teorica': ExistenciaTeoricaPage,
  'post-mortem': PostMortemPage,
  'inventario-optimo': InventarioOptimoPage,
  'causas-recorte': CausasRecortePage,
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
            (() => { const Pagina = PROCESO_PAGES[tab]; return <Pagina key={refreshKey} /> })()
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
