import { useEffect, useState } from 'react'

const CEVES_COLS = [
  ['codCeve', 'Cod. CeVe'], ['nombre', 'Nombre'], ['region', 'Región'], ['organizacion', 'Organización'],
  ['areaNegocio', 'Área Negocio'], ['gerente', 'Gerente'], ['subgerente', 'Subgerente'],
  ['coordinador', 'Coordinador'], ['turnoLaboral', 'Turno'],
]

const CATALOGOS = [
  { key: 'ceves', label: 'CeVes', fuente: 'CEVEs', carpeta: 'Catalogos/CEVEs' },
  { key: 'productos-hub', label: 'Productos HubPedidos', fuente: 'Productos HubPedidos', carpeta: 'Catalogos/ProductosHubPedidos' },
  { key: 'rtm', label: 'Productos RTM', fuente: 'Productos RTM', carpeta: 'Catalogos/ProductosHubPedidos/RTM' },
  { key: 'calendario', label: 'Calendario', fuente: 'Calendario', carpeta: 'Catalogos/Calendario' },
  { key: 'oracle-ceves', label: 'Catálogo CeVes Oracle', fuente: 'Catálogo CeVes Oracle', carpeta: 'Catalogos/CatalogosOracle/CeVes' },
  { key: 'oracle-facilities', label: 'Catálogo Facilities Oracle', fuente: 'Catálogo Destination Facility Oracle', carpeta: 'Catalogos/CatalogosOracle/Facilities' },
  { key: 'plantas', label: 'Plantas / Cedis', fuente: 'Plantas / Cedis', carpeta: 'Catalogos/Plantas' },
  { key: 'pedido-ceve-planta', label: 'Pedido CeVe a Planta/Cedis', fuente: 'Pedido CeVe a Planta/Cedis', carpeta: 'Cargas/PedidoCevePlanta' },
  { key: 'pedido-oracle', label: 'Pedido Oracle', fuente: 'Pedido Oracle', carpeta: 'Cargas/PedidoOracle' },
  { key: 'existencia-ceve-manual', label: 'Existencia CeVe Manual', fuente: 'Existencia CeVe Manual', carpeta: 'Cargas/ExistenciaCeveManual' },
  { key: 'pedido-vs-cargo-real', label: 'PedidoVSCargo Real', fuente: 'PedidoVSCargo Real', carpeta: 'Cargas/PedidoVsCargoReal' },
  { key: 'participacion-tipo-movimiento', label: 'Participación - Tipo Movimiento', fuente: 'Participación - Tipo Movimiento', carpeta: 'Cargas/ParticipacionTipoMovimiento' },
]

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
        <div style={{ width: 220, background: '#fff', borderRight: '1px solid #e5e7eb', minHeight: 'calc(100vh - 64px)' }}>
          {CATALOGOS.map(c => (
            <div key={c.key} onClick={() => setTab(c.key)} style={{
              padding: '12px 18px', cursor: 'pointer', fontSize: 13, fontWeight: tab === c.key ? 700 : 500,
              background: tab === c.key ? '#eff6ff' : 'transparent', color: tab === c.key ? '#2563eb' : '#374151',
              borderLeft: tab === c.key ? '3px solid #2563eb' : '3px solid transparent',
            }}>
              {c.label}
            </div>
          ))}
        </div>

        <div className="content" style={{ flex: 1 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong>Estado de carga — {activo?.label}</strong>
              <button onClick={handleRecargar} disabled={recargando}>
                {recargando ? 'Recargando…' : 'Recargar datos'}
              </button>
            </div>
            <div className="mono">
              Archivo esperado en: Datos/{activo?.carpeta}/*.csv
              {estadoFuente && <> — último cargado: {estadoFuente.archivo} ({estadoFuente.filas.toLocaleString('es-MX')} filas, {estadoFuente.cargadoEn?.slice(0, 16).replace('T', ' ')})</>}
            </div>
            {mensaje && <p>{mensaje}</p>}
          </div>

          <div className="card" key={refreshKey}>
            {tab === 'ceves' ? <CevesTable /> : <GenericTable apiPath={API_PATHS[tab]} />}
          </div>
        </div>
      </div>
    </>
  )
}
