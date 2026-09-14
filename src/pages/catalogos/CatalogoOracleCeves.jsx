import { useState, useEffect, useRef, useCallback } from 'react'
import { API } from '../../App'

function fmtDT(val) {
  if (!val) return '—'
  return new Date(val).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}
function fmtNum(n) { return n == null ? '—' : n.toLocaleString('es-MX') }

// ── Upload card genérico ──────────────────────────────────────────────────────
function UploadCard({ cols, uploadUrl, batchesUrl, deleteUrl, tableHeaders, rowRender }) {
  const [file, setFile]         = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult]     = useState(null)
  const [batches, setBatches]   = useState([])
  const [loadingB, setLoadingB] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const inputRef = useRef(null)

  async function loadBatches() {
    setLoadingB(true)
    try {
      const r = await fetch(`${API}${batchesUrl}`)
      if (r.ok) setBatches(await r.json())
    } catch {}
    finally { setLoadingB(false) }
  }

  useEffect(() => { loadBatches() }, [])

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.toLowerCase().endsWith('.csv')) setFile(f)
    else alert('Solo se aceptan archivos .csv')
  }

  async function handleUpload() {
    if (!file) return
    if (!confirm(`¿Cargar "${file.name}"?`)) return
    setUploading(true); setResult(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const r = await fetch(`${API}${uploadUrl}`, { method: 'POST', body: form })
      const text = await r.text()
      const d = text ? JSON.parse(text) : {}
      if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`)
      setResult({ ok: true, saved: d.saved })
      setFile(null)
      await loadBatches()
    } catch (e) {
      setResult({ ok: false, msg: e.message })
    } finally { setUploading(false) }
  }

  async function handleDelete(batchId, nombre) {
    if (!confirm(`¿Eliminar la carga "${nombre}"?`)) return
    setDeleting(batchId)
    try {
      await fetch(`${API}${deleteUrl}/${batchId}`, { method: 'DELETE' })
      await loadBatches()
    } finally { setDeleting(null) }
  }

  return (
    <div>
      {/* Columnas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {cols.map((c, i) => (
          <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99,
            background: '#e0e7ff', color: '#3730a3', fontFamily: 'monospace' }}>{c}</span>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !file && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#3b82f6' : file ? '#22c55e' : '#93c5fd'}`,
          borderRadius: 10, padding: '22px 20px', textAlign: 'center',
          cursor: file ? 'default' : 'pointer',
          background: dragging ? '#eff6ff' : file ? '#f0fdf4' : '#fff',
          transition: 'all .15s', marginBottom: 12,
        }}
      >
        <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }} />
        {file ? (
          <div>
            <div style={{ fontSize: 22, marginBottom: 4 }}>📄</div>
            <div style={{ fontWeight: 700, color: '#15803d', fontSize: 13 }}>{file.name}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </div>
            <button onClick={e => { e.stopPropagation(); setFile(null) }}
              style={{ marginTop: 8, fontSize: 12, padding: '3px 10px', borderRadius: 6,
                border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
              ✕ Quitar
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 26, marginBottom: 6 }}>☁</div>
            <div style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>
              Arrastra el CSV o <span style={{ color: '#2563eb' }}>haz clic</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <button className="btn primary" onClick={handleUpload} disabled={!file || uploading}
          style={{ padding: '8px 24px', fontWeight: 700, fontSize: 13 }}>
          {uploading ? '⏳ Cargando…' : '↑ Cargar archivo'}
        </button>
      </div>

      {result && (
        <div style={{ padding: '9px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14,
          background: result.ok ? '#ecfdf5' : '#fef2f2',
          color: result.ok ? '#065f46' : '#991b1b',
          border: `1px solid ${result.ok ? '#6ee7b7' : '#fca5a5'}` }}>
          {result.ok ? `✓ ${fmtNum(result.saved)} registros cargados.` : `✕ ${result.msg}`}
        </div>
      )}

      {/* Historial */}
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>
        Historial de cargas
      </div>
      {loadingB ? (
        <div style={{ fontSize: 13, color: '#9ca3af' }}>Cargando…</div>
      ) : batches.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '28px 0',
          border: '1px dashed var(--border)', borderRadius: 10 }}>Sin cargas registradas.</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Archivo', 'Registros', 'Cargado el', ''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600,
                    color: '#374151', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((b, i) => (
                <tr key={b.batchId} style={{ borderBottom: '1px solid var(--border)',
                  background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '8px 14px', maxWidth: 280, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#9ca3af', marginRight: 6 }}>
                      {b.batchId.slice(0, 8)}…
                    </span>
                    {b.nombreArchivo}
                  </td>
                  <td style={{ padding: '8px 14px', fontWeight: 600 }}>{fmtNum(b.totalFilas)}</td>
                  <td style={{ padding: '8px 14px' }}>{fmtDT(b.cargadoEn)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                    <button className="btn" onClick={() => handleDelete(b.batchId, b.nombreArchivo)}
                      disabled={deleting === b.batchId}
                      style={{ fontSize: 12, padding: '3px 10px', color: '#dc2626', borderColor: '#fca5a5' }}>
                      {deleting === b.batchId ? '…' : '🗑 Eliminar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Catálogo actual: vista deduplicada (última versión por clave) con edición
// de campo por clic, mismo patrón que la pestaña "CeVes cargados" del Catálogo
// de CEVEs. La columna clave (Ceve CPT / HW) no es editable; el resto sí.
async function saveCatOracleCampo(apiPath, id, campo, valor) {
  await fetch(`${API}${apiPath}/${id}/campo`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campo, valor: valor || null }),
  })
}

function EditableTextCell({ apiPath, row, campo, field, value, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setVal(value ?? '') }, [value])

  async function save() {
    setEditing(false)
    if ((val || '') === (value ?? '')) return
    setSaving(true)
    try {
      await saveCatOracleCampo(apiPath, row.id, campo, val)
      onSaved(row.id, field, val)
    } catch { setVal(value ?? '') }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        disabled={saving}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setVal(value ?? ''); setEditing(false) }
        }}
        style={{ width: '100%', padding: '4px 7px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' }}
      />
    )
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Clic para editar"
      className={'editable-cell' + (value ? '' : ' empty')}
      style={{ opacity: saving ? 0.5 : 1 }}
    >
      {value || '— editar —'}
    </span>
  )
}

function AddRowForm({ apiPath, keyLabel, keyField, keyProp, editableCols, onAdded, onCancel }) {
  const [key, setKey] = useState('')
  const [vals, setVals] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleAdd() {
    if (!key.trim()) { setError(`'${keyLabel}' es obligatorio.`); return }
    setSaving(true); setError(null)
    try {
      // Arma el body con los nombres de campo que espera el backend (PascalCase)
      const payload = { [keyProp]: key.trim() }
      editableCols.forEach(c => { payload[c.campo.charAt(0).toUpperCase() + c.campo.slice(1)] = vals[c.field] || null })
      const r = await fetch(`${API}${apiPath}/actuales`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      onAdded()
    } catch (e) {
      setError(e.message)
    } finally { setSaving(false) }
  }

  return (
    <tr style={{ background: '#eff6ff' }}>
      <td>
        <input autoFocus value={key} onChange={e => setKey(e.target.value)} placeholder={keyLabel}
          style={{ width: '100%', padding: '4px 7px', borderRadius: 6, border: '1px solid #93c5fd', fontSize: 13 }} />
      </td>
      {editableCols.map(c => (
        <td key={c.field}>
          <input value={vals[c.field] || ''} onChange={e => setVals(v => ({ ...v, [c.field]: e.target.value }))}
            placeholder={c.label}
            style={{ width: '100%', padding: '4px 7px', borderRadius: 6, border: '1px solid #93c5fd', fontSize: 13 }} />
        </td>
      ))}
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {error && <span style={{ color: '#991b1b', fontSize: 11, marginRight: 8 }}>{error}</span>}
        <button className="btn primary" onClick={handleAdd} disabled={saving}
          style={{ fontSize: 12, padding: '3px 10px', marginRight: 6 }}>
          {saving ? '…' : 'Guardar'}
        </button>
        <button className="btn" onClick={onCancel} style={{ fontSize: 12, padding: '3px 10px' }}>Cancelar</button>
      </td>
    </tr>
  )
}

function ActualTab({ apiPath, keyLabel, keyField, keyProp, editableCols }) {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}${apiPath}/actuales`)
      setRows(r.ok ? await r.json() : [])
    } catch { setRows([]) }
    finally { setLoading(false) }
  }, [apiPath])

  useEffect(() => { load() }, [load])

  function handleSaved(id, field, value) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  async function handleDelete(id, label) {
    if (!confirm(`¿Eliminar el registro "${label}"?`)) return
    setDeleting(id)
    try {
      await fetch(`${API}${apiPath}/actuales/${id}`, { method: 'DELETE' })
      await load()
    } finally { setDeleting(null) }
  }

  const q = search.trim().toLowerCase()
  const filtered = q ? rows.filter(r => (r[keyField] || '').toLowerCase().includes(q)) : rows

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Buscar ${keyLabel}...`}
          style={{ flex: '0 1 280px', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{filtered.length.toLocaleString()} registros · versión más reciente de cada uno</span>
          <button className="btn primary" onClick={() => setAdding(true)} disabled={adding}
            style={{ fontSize: 12.5 }}>+ Agregar registro</button>
          <button className="btn" onClick={load}>↻ Actualizar</button>
        </div>
      </div>

      <div className="table-wrap" style={{ maxHeight: 520, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>{keyLabel}</th>
              {editableCols.map(c => <th key={c.field}>{c.label}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <AddRowForm apiPath={apiPath} keyLabel={keyLabel} keyField={keyField} keyProp={keyProp} editableCols={editableCols}
                onAdded={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />
            )}
            {loading ? (
              <tr><td colSpan={editableCols.length + 2} className="loading">Cargando...</td></tr>
            ) : filtered.length === 0 && !adding ? (
              <tr><td colSpan={editableCols.length + 2} className="empty">
                {rows.length === 0 ? 'Aún no hay registros cargados.' : 'Sin resultados para ese filtro.'}
              </td></tr>
            ) : filtered.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r[keyField]}</td>
                {editableCols.map(c => (
                  <td key={c.field}>
                    <EditableTextCell apiPath={apiPath} row={r} campo={c.campo} field={c.field}
                      value={r[c.field]} onSaved={handleSaved} />
                  </td>
                ))}
                <td style={{ textAlign: 'right' }}>
                  <button className="btn" onClick={() => handleDelete(r.id, r[keyField])}
                    disabled={deleting === r.id}
                    style={{ fontSize: 12, padding: '3px 10px', color: '#dc2626', borderColor: '#fca5a5' }}>
                    {deleting === r.id ? '…' : '🗑'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
const TABS = [
  {
    id: 'ceves',
    label: '🔷 CeVes Oracle',
    sub: 'Cat_CeVes_Oracle',
    cols: ['Ceve CPT', 'Bd', 'Ceve', 'Región', 'Piloto', 'Organización'],
    uploadUrl: '/api/cat-oracle/ceves/upload',
    batchesUrl: '/api/cat-oracle/ceves/batches',
    deleteUrl: '/api/cat-oracle/ceves/batches',
    actualApiPath: '/api/cat-oracle/ceves',
    actualKeyLabel: 'Ceve CPT',
    actualKeyField: 'ceveCPT',
    actualKeyProp: 'CeveCPT',
    actualEditableCols: [
      { field: 'bd', campo: 'bd', label: 'Bd' },
      { field: 'ceve', campo: 'ceve', label: 'Ceve' },
      { field: 'region', campo: 'region', label: 'Región' },
      { field: 'piloto', campo: 'piloto', label: 'Piloto' },
      { field: 'organizacion', campo: 'organizacion', label: 'Organización' },
    ],
  },
  {
    id: 'facilities',
    label: '🟦 Destination Facility',
    sub: 'Cat_Oracle_Destination_Facility',
    cols: ['HW', 'SIGLA', 'Planta', 'Nombre', 'SIGLA (col E)'],
    uploadUrl: '/api/cat-oracle/facilities/upload',
    batchesUrl: '/api/cat-oracle/facilities/batches',
    deleteUrl: '/api/cat-oracle/facilities/batches',
    actualApiPath: '/api/cat-oracle/facilities',
    actualKeyLabel: 'HW',
    actualKeyField: 'hw',
    actualKeyProp: 'HW',
    actualEditableCols: [
      { field: 'sigla', campo: 'sigla', label: 'Sigla' },
      { field: 'planta', campo: 'planta', label: 'Planta' },
      { field: 'nombre', campo: 'nombre', label: 'Nombre' },
      { field: 'sigla2', campo: 'sigla2', label: 'Sigla (col E)' },
    ],
  },
]

const SUB_TABS = [
  { key: 'carga', label: 'Carga', icon: '⬆' },
  { key: 'actual', label: 'Catálogo actual', icon: '📍' },
]

export default function CatalogoOracleCeves() {
  const [tab, setTab] = useState('ceves')
  const [subTab, setSubTab] = useState('carga')
  const active = TABS.find(t => t.id === tab)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
          Catálogos Oracle
        </h1>
        <p style={{ margin: '5px 0 0', fontSize: 13, color: '#6b7280' }}>
          Catálogos de referencia exportados de Oracle.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, borderBottom: '2px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '9px 18px', fontSize: 13, fontWeight: 600, border: 'none',
              borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2, background: 'none', cursor: 'pointer',
              color: tab === t.id ? '#2563eb' : '#6b7280',
            }}>
            {t.label}
            <div style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginTop: 1 }}>{t.sub}</div>
          </button>
        ))}
      </div>

      {/* Sub-tabs: Carga / Catálogo actual */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {SUB_TABS.map(s => (
          <button key={s.key} onClick={() => setSubTab(s.key)} style={{
            padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none',
            borderBottom: subTab === s.key ? '2px solid #475569' : '2px solid transparent',
            marginBottom: -1, background: 'transparent',
            color: subTab === s.key ? '#475569' : '#9ca3af', transition: 'color 0.15s',
          }}>
            <span style={{ marginRight: 5 }}>{s.icon}</span>{s.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      {subTab === 'carga' ? (
        <div style={{ background: '#f8faff', border: '1px solid #c7d7fd', borderRadius: 14, padding: '20px 22px' }}>
          <UploadCard
            key={active.id}
            cols={active.cols}
            uploadUrl={active.uploadUrl}
            batchesUrl={active.batchesUrl}
            deleteUrl={active.deleteUrl}
          />
        </div>
      ) : (
        <ActualTab
          key={active.id}
          apiPath={active.actualApiPath}
          keyLabel={active.actualKeyLabel}
          keyField={active.actualKeyField}
          keyProp={active.actualKeyProp}
          editableCols={active.actualEditableCols}
        />
      )}
    </div>
  )
}
