import { useState, useRef } from 'react'

export default function PedidoCevePlanta() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [headers, setHeaders] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef()

  const handleDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (f) processFile(f)
  }

  const processFile = (f) => {
    setFile(f)
    setPreview([])
    setHeaders([])
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Pedido CeVe a Planta / Cedis</div>
          <div className="topbar-sub">Cargas masivas · carga de pedidos por CEVE</div>
        </div>
        <div className="topbar-actions">
          <span className="badge blue">Cargas masivas</span>
        </div>
      </div>

      <div className="content" style={{ maxWidth: 700 }}>

        <div className="section-label">Cargar archivo</div>

        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current.click()}
          style={{
            border: '2px dashed var(--border-strong)',
            borderRadius: 12,
            padding: '48px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: file ? 'var(--success-bg)' : 'var(--surface)',
            marginBottom: 20,
            transition: 'background 0.15s'
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
          <div style={{ fontSize: 36, marginBottom: 10 }}>📦</div>
          {file ? (
            <>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                {(file.size / 1024).toFixed(0)} KB · Clic para cambiar
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Arrastra el archivo aquí</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                o haz clic para seleccionar · .xlsx, .xls, .csv
              </div>
            </>
          )}
        </div>

        {file && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}>
              {loading ? 'Procesando...' : 'Procesar y guardar en BD'}
            </button>
            <button className="btn" onClick={() => { setFile(null); setPreview([]); setHeaders([]) }}>
              Cancelar
            </button>
          </div>
        )}

        <div style={{ marginTop: 24, background: 'var(--accent-bg)', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: 'var(--accent-text)', lineHeight: 1.6 }}>
          <strong>En construcción.</strong> Próximamente esta sección permitirá:
          <ul style={{ margin: '8px 0 0 16px', fontSize: 12 }}>
            <li>Previsualizar las filas del archivo antes de guardar</li>
            <li>Mapear columnas del Excel a la tabla destino</li>
            <li>Validar datos y mostrar errores fila por fila</li>
            <li>Guardar en la base de datos con un clic</li>
          </ul>
        </div>

      </div>
    </>
  )
}
