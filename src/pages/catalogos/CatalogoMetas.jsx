import { useState, useEffect, useCallback, useRef } from 'react'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'
const PAGE_SIZE = 100

const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const DIAS_KEYS = ['lun','mar','mie','jue','vie','sab','dom']

function fmtDT(val) { return val ? String(val).slice(0,19).replace('T',' ') : '—' }

function DayDot({ val }) {
  const on = val === 1 || val === true || val === '1' || val === 'true'
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      width:22, height:22, borderRadius:'50%', fontSize:11, fontWeight:700,
      background: on ? '#1a56db' : '#e5e7eb',
      color: on ? '#fff' : '#9ca3af',
    }}>{on ? '✓' : ''}</span>
  )
}

function AlertaBanner({ lastUpdated, label }) {
  if (!lastUpdated) return null
  const d = new Date(lastUpdated)
  const h = Math.floor((Date.now() - d.getTime()) / 3_600_000)
  const bg = h > 72 ? '#fef2f2' : h > 24 ? '#fffbeb' : '#ecfdf5'
  const bd = h > 72 ? '#fca5a5' : h > 24 ? '#fcd34d' : '#6ee7b7'
  const tx = h > 72 ? '#991b1b' : h > 24 ? '#92400e' : '#065f46'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderRadius:8,
      fontSize:13, background:bg, border:`1px solid ${bd}`, color:tx, marginBottom:14 }}>
      <span style={{fontWeight:700}}>⏱ {label}:</span>
      <span>{fmtDT(lastUpdated)}</span>
      <span style={{opacity:0.7}}>({h < 1 ? 'hace menos de 1h' : `hace ${h}h`})</span>
    </div>
  )
}

function SearchBar({ value, onChange, placeholder, extra }) {
  return (
    <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center' }}>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ flex:1, padding:'7px 12px', borderRadius:8, border:'1px solid var(--border)', fontSize:13, outline:'none' }} />
      {extra}
    </div>
  )
}

function Pager({ page, total, onPage }) {
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages <= 1) return null
  return (
    <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:12 }}>
      <button className="btn" disabled={page===1} onClick={() => onPage(page-1)}>‹ Anterior</button>
      <span style={{ fontSize:13, color:'#6b7280', lineHeight:'30px' }}>Pág {page} / {pages}</span>
      <button className="btn" disabled={page===pages} onClick={() => onPage(page+1)}>Siguiente ›</button>
    </div>
  )
}

// ── Tab Imweb ────────────────────────────────────────────────────────────────
function TabImweb() {
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage]   = useState(1)
  const [search, setSearch] = useState('')
  const [input, setInput] = useState('')
  const timer = useRef(null)

  const load = useCallback(async (p, s) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page:p, pageSize:PAGE_SIZE, ...(s ? {search:s} : {}) })
      const r = await fetch(`${API}/api/frecuencias/imweb?${params}`)
      setData(r.ok ? await r.json() : null)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page, search) }, [page, search, load])

  const handleSearch = v => {
    setInput(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setPage(1); setSearch(v) }, 400)
  }

  return (
    <div>
      <AlertaBanner lastUpdated={data?.lastUpdated} label="Última sincronización Imweb" />
      <SearchBar value={input} onChange={handleSearch} placeholder="Buscar CeVe, Item o Producto..."
        extra={data && <span style={{fontSize:12,color:'#6b7280',whiteSpace:'nowrap'}}>{data.total.toLocaleString()} registros</span>} />
      <div className="table-wrap" style={{maxHeight:440,overflowY:'auto'}}>
        <table>
          <thead><tr>
            <th>CeVe</th><th>Item</th><th>Producto</th><th style={{textAlign:'right'}}>Cupo</th>
            {['Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => <th key={d} style={{textAlign:'center'}}>{d}</th>)}
            <th>Actualizado</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={11} className="loading">Cargando...</td></tr>
            : !data?.rows?.length ? <tr><td colSpan={11} className="empty">Sin resultados.</td></tr>
            : data.rows.map((r,i) => (
              <tr key={i}>
                <td style={{fontWeight:500}}>{r.ceve}</td>
                <td style={{fontFamily:'monospace',fontSize:12}}>{r.item}</td>
                <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.producto}</td>
                <td style={{textAlign:'right'}}>{r.cupo}</td>
                {['lun','mar','mie','jue','vie','sab'].map(k => <td key={k} style={{textAlign:'center'}}><DayDot val={r[k]} /></td>)}
                <td style={{fontSize:11,color:'#6b7280'}}>{fmtDT(r.actualizadoEn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data?.total ?? 0} onPage={setPage} />
    </div>
  )
}

// ── Tab Hub Pedidos ──────────────────────────────────────────────────────────
function TabHub() {
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage]   = useState(1)
  const [search, setSearch] = useState('')
  const [input, setInput] = useState('')
  const timer = useRef(null)

  const load = useCallback(async (p, s) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page:p, pageSize:PAGE_SIZE, ...(s ? {search:s} : {}) })
      const r = await fetch(`${API}/api/frecuencias/hub?${params}`)
      setData(r.ok ? await r.json() : null)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page, search) }, [page, search, load])

  const handleSearch = v => {
    setInput(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setPage(1); setSearch(v) }, 400)
  }

  const DAY_KEYS_HUB = ['transportMonday','transportTuesday','transportWednesday','transportThursday','transportFriday','transportSaturday','transportSunday']

  return (
    <div>
      <AlertaBanner lastUpdated={data?.lastUpdated} label="Última actualización HubPedidos" />
      <SearchBar value={input} onChange={handleSearch} placeholder="Buscar CeVe, Item o Producto..."
        extra={data && <span style={{fontSize:12,color:'#6b7280',whiteSpace:'nowrap'}}>{data.total.toLocaleString()} registros</span>} />
      <div className="table-wrap" style={{maxHeight:440,overflowY:'auto',overflowX:'auto'}}>
        <table>
          <thead><tr>
            <th>Org</th><th style={{textAlign:'right'}}>CeVe</th><th>Item</th><th>Producto</th><th>Almacén</th><th>Frec.</th>
            {DIAS.map(d => <th key={d} style={{textAlign:'center',minWidth:34}}>{d}</th>)}
            <th style={{textAlign:'center'}}>Activo</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={14} className="loading">Cargando...</td></tr>
            : !data?.rows?.length ? <tr><td colSpan={14} className="empty">Sin resultados.</td></tr>
            : data.rows.map((r,i) => (
              <tr key={i}>
                <td style={{fontSize:11}}>{r.orgCode}</td>
                <td style={{textAlign:'right',fontWeight:600}}>{r.salecenterCode}</td>
                <td style={{fontFamily:'monospace',fontSize:12}}>{r.itemCode}</td>
                <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.longName}</td>
                <td>{r.warehouseCode}</td>
                <td style={{fontSize:12}}>{r.transportFrequencySummary}</td>
                {DAY_KEYS_HUB.map(k => <td key={k} style={{textAlign:'center'}}><DayDot val={r[k]} /></td>)}
                <td style={{textAlign:'center',color: (r.active===true||r.active===1) ? '#065f46' : '#9ca3af'}}>
                  {(r.active===true||r.active===1) ? '✓' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data?.total ?? 0} onPage={setPage} />
    </div>
  )
}

// ── Tab Consolidado ──────────────────────────────────────────────────────────
function TabConsolidado() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [input, setInput]     = useState('')
  const [origen, setOrigen]   = useState('')
  const timer = useRef(null)

  const load = useCallback(async (p, s, o) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page:p, pageSize:PAGE_SIZE, ...(s?{search:s}:{}), ...(o?{origen:o}:{}) })
      const r = await fetch(`${API}/api/frecuencias/consolidado?${params}`)
      setData(r.ok ? await r.json() : null)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page, search, origen) }, [page, search, origen, load])

  const handleSearch = v => {
    setInput(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setPage(1); setSearch(v) }, 400)
  }

  const handleConsolidar = async () => {
    if (!confirm('¿Ejecutar consolidación? Esto reemplaza el catálogo actual con datos frescos de Imweb y HubPedidos.')) return
    setRunning(true); setRunResult(null)
    try {
      const r = await fetch(`${API}/api/frecuencias/consolidar`, { method:'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`)
      setRunResult({ ok:true, d })
      setPage(1)
      await load(1, search, origen)
    } catch (e) {
      setRunResult({ ok:false, msg: e.message })
    } finally { setRunning(false) }
  }

  const meta = data?.meta

  return (
    <div>
      {/* Botón ejecutar */}
      <div style={{ background:'#f0f4ff', border:'1px solid #93b4fd', borderRadius:12, padding:'14px 18px',
        display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{fontWeight:700, fontSize:14, color:'#1e3a8a'}}>Catálogo consolidado Frecuencias Producto CeVes</div>
          <div style={{fontSize:12, color:'#4b5563', marginTop:3}}>
            Regla: si el par CeVe + Item existe en <strong>Hub Pedidos</strong>, prevalece Hub; sino se toma de <strong>Imweb</strong>.
          </div>
        </div>
        <button className="btn primary" onClick={handleConsolidar} disabled={running}
          style={{padding:'9px 20px', fontWeight:700, fontSize:13}}>
          {running ? '⏳ Ejecutando...' : '▶ Ejecutar consolidación'}
        </button>
      </div>

      {runResult && (
        <div style={{ padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:14,
          background: runResult.ok ? '#ecfdf5' : '#fef2f2',
          color:      runResult.ok ? '#065f46'  : '#991b1b',
          border:     `1px solid ${runResult.ok ? '#6ee7b7' : '#fca5a5'}` }}>
          {runResult.ok
            ? `✓ Consolidación exitosa — ${runResult.d.total?.toLocaleString()} registros (${runResult.d.totalHub?.toLocaleString()} Hub + ${runResult.d.totalImweb?.toLocaleString()} Imweb) · ${fmtDT(runResult.d.fechaEjecucion)}`
            : `✕ ${runResult.msg}`}
        </div>
      )}

      {meta && (
        <div style={{ display:'flex', gap:12, marginBottom:14, flexWrap:'wrap' }}>
          {[
            { label:'Total registros', val: Number(meta.tot).toLocaleString() },
            { label:'De Hub Pedidos',  val: Number(meta.hub).toLocaleString(), color:'#1a56db' },
            { label:'De Imweb',        val: Number(meta.imweb).toLocaleString(), color:'#0f6e56' },
            { label:'Última ejecución', val: fmtDT(meta.fechaEjecucion) },
          ].map(m => (
            <div key={m.label} style={{ background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:10, padding:'10px 16px', minWidth:140 }}>
              <div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>{m.label}</div>
              <div style={{fontSize:15,fontWeight:700,color: m.color || '#111827'}}>{m.val}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:'flex', gap:10, marginBottom:14, alignItems:'center', flexWrap:'wrap'}}>
        <input value={input} onChange={e => handleSearch(e.target.value)} placeholder="Buscar CeVe o Item..."
          style={{flex:1,minWidth:180,padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',fontSize:13,outline:'none'}} />
        <select value={origen} onChange={e => { setOrigen(e.target.value); setPage(1) }}
          style={{padding:'7px 10px',borderRadius:8,border:'1px solid var(--border)',fontSize:13,background:'var(--surface)',cursor:'pointer'}}>
          <option value="">Todos los orígenes</option>
          <option value="HubPedidos">Hub Pedidos</option>
          <option value="Imweb">Imweb</option>
        </select>
        {data && <span style={{fontSize:12,color:'#6b7280',whiteSpace:'nowrap'}}>{data.total.toLocaleString()} registros</span>}
      </div>

      {!meta && !loading && (
        <div style={{textAlign:'center',padding:'40px 20px',color:'#9ca3af',fontSize:14}}>
          Sin datos aún. Presiona <strong>Ejecutar consolidación</strong> para generar el catálogo.
        </div>
      )}

      {(meta || loading) && (
        <div className="table-wrap" style={{maxHeight:440,overflowY:'auto'}}>
          <table>
            <thead><tr>
              <th>CeVe</th><th>Item</th>
              {DIAS.map(d => <th key={d} style={{textAlign:'center',minWidth:34}}>{d}</th>)}
              <th>Origen</th><th>Ejecución</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={12} className="loading">Cargando...</td></tr>
              : !data?.rows?.length ? <tr><td colSpan={12} className="empty">Sin resultados.</td></tr>
              : data.rows.map((r,i) => (
                <tr key={i}>
                  <td style={{fontWeight:600}}>{r.cod_ceve}</td>
                  <td style={{fontFamily:'monospace',fontSize:12}}>{r.item}</td>
                  {DIAS_KEYS.map(k => <td key={k} style={{textAlign:'center'}}><DayDot val={r[k]} /></td>)}
                  <td>
                    <span style={{
                      fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:10,
                      background: r.sistemaOrigen==='HubPedidos' ? '#eff4ff' : '#ecfdf5',
                      color:      r.sistemaOrigen==='HubPedidos' ? '#1a56db' : '#065f46',
                    }}>{r.sistemaOrigen}</span>
                  </td>
                  <td style={{fontSize:11,color:'#6b7280'}}>{fmtDT(r.fechaEjecucion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={data?.total ?? 0} onPage={p => { setPage(p); load(p, search, origen) }} />
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
const TABS = [
  { key:'imweb',       label:'Imweb',       sub:'CatalogoCuposImweb',        icon:'🔷' },
  { key:'hub',         label:'Hub Pedidos', sub:'FrecuenciaTransportacion',   icon:'🟦' },
  { key:'consolidado', label:'Consolidado', sub:'FrecuenciasConsolidadas',    icon:'⚡' },
]

export default function CatalogoMetas() {
  const [tab, setTab] = useState('imweb')

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Frecuencias Producto CeVes</div>
          <div className="topbar-sub">Consulta y consolidación de frecuencias por fuente de datos</div>
        </div>
      </div>

      <div className="content">
        <div style={{ display:'flex', gap:0, borderBottom:'2px solid var(--border)', marginBottom:20 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding:'10px 22px', fontSize:13, fontWeight:600, cursor:'pointer', border:'none',
              borderBottom: tab===t.key ? '2px solid #1a56db' : '2px solid transparent',
              marginBottom:-2, background:'transparent',
              color: tab===t.key ? '#1a56db' : '#6b7280', transition:'color 0.15s',
            }}>
              <span style={{marginRight:6}}>{t.icon}</span>{t.label}
              <span style={{display:'block',fontSize:10,fontWeight:400,color:'#9ca3af',marginTop:1}}>{t.sub}</span>
            </button>
          ))}
        </div>

        {tab==='imweb'       && <TabImweb />}
        {tab==='hub'         && <TabHub />}
        {tab==='consolidado' && <TabConsolidado />}
      </div>
    </>
  )
}
