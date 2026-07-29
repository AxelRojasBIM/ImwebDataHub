import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
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
import CatalogoOracleCeves from './pages/catalogos/CatalogoOracleCeves'
import CatalogoPlantas from './pages/catalogos/CatalogoPlantas'
import PedidoVendedorPromedios from './pages/PedidoVendedorPromedios'
import ParticipacionTipoMovimiento from './pages/ParticipacionTipoMovimiento'
import ExistenciaCeveManual from './pages/ExistenciaCeveManual'
import PedidoVsCargoReal from './pages/PedidoVsCargoReal'
import ExistenciaTeorica from './pages/ExistenciaTeorica'
import PostMortem from './pages/PostMortem'
import InvOpt from './pages/InvOpt'
import CausasRecorte from './pages/CausasRecorte'
import CausasRecorteTablero from './pages/CausasRecorteTablero'
import ExistenciaTeoricaTablero from './pages/ExistenciaTeoricaTablero'
import Login from './pages/Login'
import Administracion from './pages/admin/Administracion'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from './AuthContext'
import { hasMenuAccess, firstAllowedPath } from './permissions'
import nav from './navConfig'
import './App.css'

const SIDEBAR_COLLAPSED_KEY = 'imwebdatahub_sidebar_collapsed'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'
export { API }

// Ping silencioso al arrancar para despertar Azure App Service
// (free tier duerme tras 20 min de inactividad; esto evita el "Failed to fetch" en el primer request)
function useWarmUp() {
  useEffect(() => {
    fetch(`${API}/api/health`, { signal: AbortSignal.timeout(30_000) }).catch(() => {})
  }, [])
}

// Redirige si la ruta actual no está permitida para el rol del usuario — cubre
// la navegación directa por URL, no solo lo que se oculta del sidebar.
function Guarded({ path, rol, children }) {
  if (!hasMenuAccess(rol, path)) {
    const fallback = firstAllowedPath(nav, rol)
    return <Navigate to={fallback ?? '/sin-acceso'} replace />
  }
  return children
}

export default function App() {
  useWarmUp()
  const { usuario, authLoading, logout } = useAuth()

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        Cargando…
      </div>
    )
  }

  if (!usuario) return <Login />

  return <AppShell usuario={usuario} logout={logout} />
}

function AppShell({ usuario, logout }) {
  const rol = usuario.rol
  const navFiltered = nav
    .map(group => ({ ...group, items: group.items.filter(item => hasMenuAccess(rol, item.to)) }))
    .filter(group => group.items.length > 0)
  const home = firstAllowedPath(nav, rol)

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1')
  function toggleCollapsed() {
    setCollapsed(c => {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, c ? '0' : '1')
      return !c
    })
  }

  return (
    <div className="shell">
      <aside className={'sidebar' + (collapsed ? ' collapsed' : '')}>
        <div className="sidebar-logo">
          {!collapsed && (
            <div>
              <div className="logo-title"><span className="logo-title-accent">CeVe</span>Data</div>
              <div className="logo-sub">Gestión e indicadores</div>
            </div>
          )}
          <button className="sidebar-collapse-btn" onClick={toggleCollapsed} title={collapsed ? 'Expandir menú' : 'Contraer menú'}>
            {collapsed ? <ChevronRight size={15} strokeWidth={2} /> : <ChevronLeft size={15} strokeWidth={2} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navFiltered.map(group => (
            <div key={group.section}>
              {!collapsed && <div className="nav-section">{group.section}</div>}
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                >
                  <span className="nav-icon"><item.icon size={17} strokeWidth={1.75} /></span>
                  {!collapsed && <span className="nav-label">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && <div className="sidebar-footer-name">{usuario.nombreCompleto}</div>}
          <button className="sidebar-footer-logout" onClick={logout} title={collapsed ? 'Cerrar sesión' : undefined}>
            {collapsed ? '⏻' : 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to={home ?? '/sin-acceso'} replace />} />
          <Route path="/sin-acceso" element={
            <div style={{ padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
              Tu usuario no tiene acceso a ninguna página. Contacta a un administrador.
            </div>
          } />
          <Route path="/cupos" element={<Guarded path="/cupos" rol={rol}><CatalogoCupos /></Guarded>} />
          <Route path="/remisiones" element={<Guarded path="/remisiones" rol={rol}><Remisiones /></Guarded>} />
          <Route path="/productos" element={<Guarded path="/productos" rol={rol}><Productos /></Guarded>} />
          <Route path="/subir" element={<Guarded path="/subir" rol={rol}><SubirArchivo /></Guarded>} />
          <Route path="/pedido-ceve-planta" element={<Guarded path="/pedido-ceve-planta" rol={rol}><PedidoCevePlanta /></Guarded>} />
          <Route path="/fill-rate" element={<Guarded path="/fill-rate" rol={rol}><FillRate /></Guarded>} />
          <Route path="/pedido-oracle" element={<Guarded path="/pedido-oracle" rol={rol}><PedidoOracle /></Guarded>} />
          <Route path="/catalogos/ceves" element={<Guarded path="/catalogos/ceves" rol={rol}><CatalogoCeves /></Guarded>} />
          <Route path="/catalogos/productos" element={<Guarded path="/catalogos/productos" rol={rol}><CatalogoProductos /></Guarded>} />
          <Route path="/catalogos/metas" element={<Guarded path="/catalogos/metas" rol={rol}><CatalogoMetas /></Guarded>} />
          <Route path="/catalogos/calendario" element={<Guarded path="/catalogos/calendario" rol={rol}><CatalogoCalendario /></Guarded>} />
          <Route path="/catalogos/oracle-ceves" element={<Guarded path="/catalogos/oracle-ceves" rol={rol}><CatalogoOracleCeves /></Guarded>} />
          <Route path="/catalogos/plantas" element={<Guarded path="/catalogos/plantas" rol={rol}><CatalogoPlantas /></Guarded>} />
          <Route path="/pedido-vendedor-promedios" element={<Guarded path="/pedido-vendedor-promedios" rol={rol}><PedidoVendedorPromedios /></Guarded>} />
          <Route path="/participacion-tipo-movimiento" element={<Guarded path="/participacion-tipo-movimiento" rol={rol}><ParticipacionTipoMovimiento /></Guarded>} />
          <Route path="/existencia-ceve-manual" element={<Guarded path="/existencia-ceve-manual" rol={rol}><ExistenciaCeveManual /></Guarded>} />
          <Route path="/pedido-vs-cargo-real" element={<Guarded path="/pedido-vs-cargo-real" rol={rol}><PedidoVsCargoReal /></Guarded>} />
          <Route path="/existencia-teorica" element={<Guarded path="/existencia-teorica" rol={rol}><ExistenciaTeorica /></Guarded>} />
          <Route path="/post-mortem" element={<Guarded path="/post-mortem" rol={rol}><PostMortem /></Guarded>} />
          <Route path="/inv-opt" element={<Guarded path="/inv-opt" rol={rol}><InvOpt /></Guarded>} />
          <Route path="/causas-recorte" element={<Guarded path="/causas-recorte" rol={rol}><CausasRecorte /></Guarded>} />
          <Route path="/causas-recorte-tablero" element={<Guarded path="/causas-recorte-tablero" rol={rol}><CausasRecorteTablero /></Guarded>} />
          <Route path="/existencia-teorica-tablero" element={<Guarded path="/existencia-teorica-tablero" rol={rol}><ExistenciaTeoricaTablero /></Guarded>} />
          <Route path="/admin/usuarios" element={<Guarded path="/admin/usuarios" rol={rol}><Administracion /></Guarded>} />
        </Routes>
      </main>
    </div>
  )
}
