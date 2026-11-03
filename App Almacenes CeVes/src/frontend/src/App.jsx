import { useEffect, useState } from 'react'

const COLS = [
  ['codCeve', 'Cod. CeVe'], ['nombre', 'Nombre'], ['region', 'Región'], ['organizacion', 'Organización'],
  ['areaNegocio', 'Área Negocio'], ['gerente', 'Gerente'], ['subgerente', 'Subgerente'],
  ['coordinador', 'Coordinador'], ['turnoLaboral', 'Turno'],
]

export default function App() {
  const [ceves, setCeves] = useState([])
  const [estado, setEstado] = useState(null)
  const [recargando, setRecargando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  async function cargarCeves() {
    const r = await fetch('/api/ceves/actuales')
    setCeves(await r.json())
  }

  async function cargarEstado() {
    const r = await fetch('/api/datos/estado')
    setEstado(await r.json())
  }

  useEffect(() => { cargarCeves(); cargarEstado() }, [])

  async function handleRecargar() {
    setRecargando(true); setMensaje(null)
    try {
      const r = await fetch('/api/datos/recargar', { method: 'POST' })
      const resultados = await r.json()
      setMensaje(resultados.map(x => x.mensaje).join(' · '))
      await cargarCeves(); await cargarEstado()
    } catch (e) {
      setMensaje('Error al recargar: ' + e.message)
    } finally {
      setRecargando(false)
    }
  }

  return (
    <>
      <div className="topbar">
        <h1>App Almacenes CeVes</h1>
        <p>Catálogo de CeVes — datos cargados desde Datos/Catalogos/CEVEs (CSV)</p>
      </div>

      <div className="content">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong>Estado de carga</strong>
            <button onClick={handleRecargar} disabled={recargando}>
              {recargando ? 'Recargando…' : 'Recargar datos'}
            </button>
          </div>
          {estado && (
            <div className="mono">
              Carpeta de datos: {estado.datosDir}<br />
              Base local: {estado.dbPath}
            </div>
          )}
          {estado?.fuentes?.length > 0 && (
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>Fuente</th><th>Archivo</th><th>Filas</th><th>Cargado</th></tr></thead>
              <tbody>
                {estado.fuentes.map(f => (
                  <tr key={f.fuente}>
                    <td>{f.fuente}</td><td>{f.archivo}</td><td>{f.filas.toLocaleString('es-MX')}</td>
                    <td className="mono">{f.cargadoEn?.slice(0, 16).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {mensaje && <p>{mensaje}</p>}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong>CeVes ({ceves.length})</strong>
            <span className={`badge ${ceves.length ? 'badge-ok' : 'badge-warn'}`}>
              {ceves.length ? 'Catálogo cargado' : 'Sin datos — deposita un CSV en Datos/Catalogos/CEVEs'}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>{COLS.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
              <tbody>
                {ceves.map(c => (
                  <tr key={c.codCeve}>
                    {COLS.map(([k]) => <td key={k}>{c[k]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
