import { useState, useRef } from 'react'

export default function SubirArchivo() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState(null)
  const inputRef = useRef()

  const handleDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (f) setFile(f)
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Subir Excel / CSV</div>
          <div className="topbar-sub">Carga manual de datos a la base de datos</div>
        </div>
      </div>
      <div className="content" style={{ maxWidth: 600 }}>
        <div className="section-label">Seleccionar archivo</div>

        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current.click()}
          style={{
            border: '2px dashed var(--border-strong)', borderRadius: 12,
            padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
            background: file ? 'var(--success-bg)' : 'var(--surface)',
            marginBottom: 16, transition: 'background 0.15s'
          }}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFile} />
          <div style={{ fontSize: 32, marginBottom: 8 }}>↑</div>
          {file ? (
            <>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{(file.size / 1024).toFixed(0)} KB · Clic para cambiar</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Arrastra tu archivo aquí</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>o haz clic para seleccionar · .xlsx, .xls, .csv</div>
            </>
          )}
        </div>

        {file && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div className="section-label" style={{ marginBottom: 12 }}>Destino</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 13, color: 'var(--text-2)' }}>
                Tabla destino
                <select style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', fontSize: 13 }}>
                  <option value="">— Seleccionar —</option>
                  <option value="cupos">CatalogoCuposImweb</option>
                  <option value="remisiones">RemisionesDetalleCEQ</option>
                  <option value="productos">RemisionesProductosCEQ</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {file && (
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }}>
            Procesar y guardar en BD
          </button>
        )}

        <div style={{ marginTop: 24, background: 'var(--accent-bg)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--accent-text)' }}>
          Esta sección está en construcción. Próximamente podrás mapear columnas del archivo a las columnas de la tabla y previsualizar los datos antes de guardar.
        </div>
      </div>
    </>
  )
}
