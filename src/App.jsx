import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import Inicio from './pages/Inicio'
import CatalogoCupos from './pages/CatalogoCupos'
import Remisiones from './pages/Remisiones'
import Productos from './pages/Productos'
import SubirArchivo from './pages/SubirArchivo'
import PedidoCevePlanta from './pages/PedidoCevePlanta'
import './App.css'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'
export { API }

const nav = [
  {
    section: 'Principal',
    items: [{ to: '/', label: 'Inicio', icon: '⊞' }]
  },
  {
    section: 'Datos existentes',
    items: [
      { to: '/cupos', label: 'Catálogo de cupos', icon: '▣', badge: 'Imweb' },
      { to: '/remisiones', label: 'Remisiones', icon: '⊡', badge: 'CEQ' },
      { to: '/productos', label: 'Productos', icon: '◫', badge: 'CEQ' },
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
        </Routes>
      </main>
    </div>
  )
}
