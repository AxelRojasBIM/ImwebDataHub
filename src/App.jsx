import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import Inicio from './pages/Inicio'
import CatalogoCupos from './pages/CatalogoCupos'
import Remisiones from './pages/Remisiones'
import Productos from './pages/Productos'
import SubirArchivo from './pages/SubirArchivo'
import PedidoCevePlanta from './pages/PedidoCevePlanta'
import FillRate from './pages/FillRate'
import PedidoOracle from './pages/PedidoOracle'
import CatalogoCeves from './pages/catalogos/CatalogoCeves'
import CatalogoProductos from './pages/catalogos/CatalogoProductos'
import CatalogoMetas from './pages/catalogos/CatalogoMetas'
import CatalogoCalendario from './pages/catalogos/CatalogoCalendario'
import './App.css'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'
export { API }

const nav = [
  {
    section: 'Principal',
    items: [{ to: '/', label: 'Inicio', icon: '⊞' }]
  },
  {
    section: 'Ejecución Proceso',
    items: [
      { to: '/fill-rate', label: 'Fill Rate Planta/Cedis a CeVe', icon: '▣' },
    ]
  },
  {
    section: 'Carga manual',
    items: [
      { to: '/subir', label: 'Subir Excel / CSV', icon: '↑', badge: 'Nuevo', badgeType: 'new' },
    ]
  },
  {
    section: 'Cargas masivas',
    items: [
      { to: '/pedido-ceve-planta', label: 'Pedido CeVe a Planta/Cedis', icon: '⊞', badgeType: 'new', badge: 'Nuevo' },
      { to: '/pedido-oracle',      label: 'Pedido Oracle',              icon: '◈' },
    ]
  },
  {
    section: 'Catálogos',
    items: [
      { to: '/catalogos/ceves',      label: 'CEVEs',      icon: '◈' },
      { to: '/catalogos/productos',  label: 'Productos HubPedidos',  icon: '◉' },
      { to: '/catalogos/metas',      label: 'Frecuencias Producto CeVes', icon: '◎' },
      { to: '/catalogos/calendario', label: 'Calendario', icon: '▦' },
    ]
  },
]

export default function App() {
  const location = useLocation()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">DB</div>
          <div>
            <div className="logo-title">Bimbo Data Hub</div>
            <div className="logo-sub">Gestión e indicadores</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {nav.map(group => (
            <div key={group.section}>
              <div className="nav-section">{group.section}</div>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                  {item.badge && (
                    <span className={'nav-badge' + (item.badgeType === 'new' ? ' new' : '')}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">axel.rojas · Bimbo</div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/cupos" element={<CatalogoCupos />} />
          <Route path="/remisiones" element={<Remisiones />} />
          <Route path="/productos" element={<Productos />} />
          <Route path="/subir" element={<SubirArchivo />} />
          <Route path="/pedido-ceve-planta" element={<PedidoCevePlanta />} />
          <Route path="/fill-rate"            element={<FillRate />} />
          <Route path="/pedido-oracle"        element={<PedidoOracle />} />
          <Route path="/catalogos/ceves"      element={<CatalogoCeves />} />
          <Route path="/catalogos/productos"  element={<CatalogoProductos />} />
          <Route path="/catalogos/metas"      element={<CatalogoMetas />} />
          <Route path="/catalogos/calendario" element={<CatalogoCalendario />} />
        </Routes>
      </main>
    </div>
  )
}
