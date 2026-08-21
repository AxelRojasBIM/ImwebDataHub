import {
  Stethoscope, Ruler, BarChart3, Search, Calculator, Warehouse,
  LayoutGrid, Database, TrendingUp, PieChart, Package, Truck,
  MapPin, Boxes, Target, Calendar, Factory, Users,
} from 'lucide-react'

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
    section: 'Gestión de Inventarios',
    items: [
      { to: '/gestion-inventarios', label: 'Gestión de Inventarios', icon: Warehouse },
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
  {
    section: 'Administración',
    items: [
      { to: '/admin/usuarios', label: 'Usuarios y Roles', icon: Users },
    ]
  },
]

export default nav
