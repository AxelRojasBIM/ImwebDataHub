export default function CatalogoProductos() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Catálogo de Productos</div>
          <div className="topbar-sub">Alta, baja y modificación de productos</div>
        </div>
      </div>
      <div className="content">
        <div className="empty" style={{ marginTop: 60 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>◉</div>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>Catálogo de Productos</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Esta sección está en construcción.</div>
        </div>
      </div>
    </>
  )
}
