import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom'
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
import { useEffect } from 'react'
import {
  Stethoscope, Ruler, BarChart3, Search, Calculator, Upload,
  LayoutGrid, Database, TrendingUp, PieChart, Package, Truck,
  MapPin, Boxes, Target, Calendar, Factory,
} from 'lucide-react'
import './App.css'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'
export { API }

// Ping silencioso al arrancar para despertar Azure App Service
// (free tier duerme tras 20 min de inactividad; esto evita el "Failed to fetch" en el primer request)
function useWarmUp() {
  useEffect(() => {
    fetch(`${API}/api/health`, { signal: AbortSignal.timeout(30_000) }).catch(() => {})
  }, [])
}

const nav = [
  {
    section: 'Principal',
    items: [
      { to: '/causas-recorte-tablero', label: 'Causas Recorte', icon: Stethoscope },
      { to: '/existencia-teorica-tablero', label: 'Existencia Teórica', icon: Ruler },
    ]
  },
  {
    section: 'Ejecución Proceso',
    items: [
      { to: '/fill-rate', label: 'Fill Rate Planta/Cedis a CeVe', icon: BarChart3 },
      { to: '/existencia-teorica', label: 'Existencia Teórica', icon: Ruler },
      { to: '/post-mortem', label: 'Post-Mortem', icon: Search },
      { to: '/inv-opt', label: 'Cálculo Inventario Óptimo', icon: Calculator },
      { to: '/causas-recorte', label: 'Causas Recorte', icon: Stethoscope },
    ]
  },
  {
    section: 'Carga manual',
    items: [
      { to: '/subir', label: 'Subir Excel / CSV', icon: Upload },
    ]
  },
  {
    section: 'Cargas masivas',
    items: [
      { to: '/pedido-ceve-planta', label: 'Pedido CeVe a Planta/Cedis', icon: LayoutGrid },
      { to: '/pedido-oracle',      label: 'Pedido Oracle',              icon: Database },
      { to: '/pedido-vendedor-promedios', label: 'Promedios de Pedido', icon: TrendingUp },
      { to: '/participacion-tipo-movimiento', label: 'Participación - Tipo Movimiento', icon: PieChart },
      { to: '/existencia-ceve-manual', label: 'Existencia CeVe Manual', icon: Package },
      { to: '/pedido-vs-cargo-real', label: 'PedidoVSCargo Real', icon: Truck },
    ]
  },
  {
    section: 'Catálogos',
    items: [
      { to: '/catalogos/ceves',      label: 'CEVEs',      icon: MapPin },
      { to: '/catalogos/productos',  label: 'Productos HubPedidos',  icon: Boxes },
      { to: '/catalogos/metas',      label: 'Frecuencias Producto CeVes', icon: Target },
      { to: '/catalogos/calendario',    label: 'Calendario',          icon: Calendar },
      { to: '/catalogos/oracle-ceves',  label: 'Catálogos Oracle',    icon: Database },
      { to: '/catalogos/plantas',       label: 'Plantas / Cedis',     icon: Factory },
    ]
  },
]

export default function App() {
  useWarmUp()
  const location = useLocation()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div>
            <div className="logo-title"><span className="logo-title-accent">CeVe</span>Data</div>
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
                  <span className="nav-icon"><item.icon size={17} strokeWidth={1.75} /></span>
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">axel.rojas · Bimbo</div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/causas-recorte-tablero" replace />} />
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
          <Route path="/catalogos/calendario"   element={<CatalogoCalendario />} />
          <Route path="/catalogos/oracle-ceves" element={<CatalogoOracleCeves />} />
          <Route path="/catalogos/plantas"      element={<CatalogoPlantas />} />
          <Route path="/pedido-vendedor-promedios" element={<PedidoVendedorPromedios />} />
          <Route path="/participacion-tipo-movimiento" element={<ParticipacionTipoMovimiento />} />
          <Route path="/existencia-ceve-manual" element={<ExistenciaCeveManual />} />
          <Route path="/pedido-vs-cargo-real" element={<PedidoVsCargoReal />} />
          <Route path="/existencia-teorica" element={<ExistenciaTeorica />} />
          <Route path="/post-mortem" element={<PostMortem />} />
          <Route path="/inv-opt" element={<InvOpt />} />
          <Route path="/causas-recorte" element={<CausasRecorte />} />
          <Route path="/causas-recorte-tablero" element={<CausasRecorteTablero />} />
          <Route path="/existencia-teorica-tablero" element={<ExistenciaTeoricaTablero />} />
        </Routes>
      </main>
    </div>
  )
}
