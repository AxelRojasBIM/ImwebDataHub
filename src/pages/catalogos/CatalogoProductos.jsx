import { useState, useRef, useEffect, useCallback } from 'react'

const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'

// ── HubPedidos ───────────────────────────────────────────────────────────────
const COLS = [
  'OrgCode','ItemCode','MasterCode','ShortName','LongName','Price','Barcode',
  'TrayCapacity','TrayChecking','ContainerCapacity','TrayCode','ContainerCode',
  'ShelfLife','DaysLife','Brand','RoundingFactor','CategoryItem','BedsPerContainer','RoundingCap'
]

const TEMPLATE = `OrgCode,ItemCode,MasterCode,ShortName,LongName,Price,Barcode,TrayCapacity,TrayChecking,ContainerCapacity,TrayCode,ContainerCode,ShelfLife,DaysLife,Brand,RoundingFactor,CategoryItem,BedsPerContainer,RoundingCap
OBM,0108,108,BaguePrec280g,Baguette Precocida Cong 1p 280g BOLSA DH,9.88,7501000149476,8,False,70,MTA,C107,Larga,150.00,DEL HOGAR,0.00,BREADS,70,0
`

const PREVIEW_COLS = ['OrgCode','ItemCode','ShortName','Brand','CategoryItem','Price']

// Columnas que deberían traer un código corto sin espacios; si aparecen con
// espacios es señal de que esa fila viene descuadrada en el CSV de origen.
const CODE_COLS = ['OrgCode','ItemCode','MasterCode','Barcode','TrayChecking','TrayCode','ContainerCode']

// ── RTM (M05_ProductMaster) ─────────────────────────────────────────────────
const RTM_COLS = [
  'Product_Id','Product_code','Product_Global_Code','Product_Full_Desc','Product_Short_Desc',
  'Company_Code','Company_Name','Brand_Code','Brand_Name','Category_Code','Category_Name',
  'Segment_Code','Segment_Name','Line_Code','Line_Name','Base_Uom','PrimarySalesUOM','Weight',
  'Pack1_Size','Pack2_Size','Piece_Price','Product_BarCode','Sequence','IsSalable','IsReturnable',
  'Tray_Code','Clave_Prod','Clave_Unidad','Shelf_Life','Return_Rate','Base_Price_Sales_Center',
  'Unit_Measure','MRP','Instance','Active'
]

const RTM_TEMPLATE = `${RTM_COLS.join(',')}
1001,0108,GBL0108,Baguette Precocida Congelada 1p 280g,BaguePrec280g,OBM,Bimbo,MKT,Marinela,CAT01,Panificados,SEG01,Panaderia,LN01,Linea Hogar,PZA,PZA,0.28,1,8,9.88,7501000149476,1,S,N,MTA,C107,U01,150,0.00,9.88,PZA,N,PROD,S
`

const RTM_PREVIEW_COLS = ['Product_code','Product_Short_Desc','Brand_Name','Category_Name','Piece_Price']

// Company_Code se excluye a propósito: en artículos de empaque/retornables
// (tinas, charolas, tarimas, canastillas) legítimamente trae una descripción
// en vez de un código corto, así que no es señal confiable de fila descuadrada.
const RTM_CODE_COLS = [
  'Product_Id','Product_code','Product_Global_Code','Brand_Code','Category_Code',
  'Segment_Code','Line_Code','Base_Uom','PrimarySalesUOM','Product_BarCode','Sequence',
  'IsSalable','IsReturnable','Tray_Code','Clave_Prod','Clave_Unidad','Unit_Measure','MRP','Instance','Active'
]

// Parser de CSV completo (no línea por línea): respeta comillas incluso si el
// campo trae saltos de línea adentro (ej. una descripción exportada con \n),
// porque partir primero por '\n' descuadra las columnas de esa fila sin avisar.
function parseCSVRows(text) {
  const rows = []
  let row = [], cur = '', inQ = false
  const len = text.length
  for (let i = 0; i < len; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
      continue
    }
    if (ch === '"') { inQ = true; continue }
    if (ch === ',') { row.push(cur.trim()); cur = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') {
      row.push(cur.trim())
      rows.push(row)
      row = []; cur = ''
      continue
    }
    cur += ch
  }
  if (cur !== '' || row.length) { row.push(cur.trim()); rows.push(row) }
  // descarta líneas realmente vacías (una sola columna vacía)
  return rows.filter(r => !(r.length === 1 && r[0] === ''))
}

// Revisa columnas que deberían traer códigos cortos (sin espacios). Si un valor
// trae espacios ahí, casi seguro esa fila viene descuadrada en el CSV de origen
// (por ejemplo, un campo vacío que el exportador omitió en vez de dejarlo en
// blanco, lo que recorre una posición todas las columnas siguientes de esa fila
// aunque el total de columnas siga cuadrando). Esto es lo que NO detecta la
// validación de conteo de columnas, así que se revisa aparte y de una vez sobre
// todo el archivo, en lugar de ir descubriendo fila por fila con errores del
// servidor.
function findCodeAnomalies(allRows, headers, codeCols) {
  const idxs = codeCols.map(c => headers.indexOf(c)).filter(idx => idx !== -1).map((idx, k) => ({ col: codeCols[k], idx }))
  const anomalies = []
  for (let i = 1; i < allRows.length; i++) {
    const vals = allRows[i]
    for (const { col, idx } of idxs) {
      const v = vals[idx] ?? ''
      if (v.includes(' ')) anomalies.push({ line: i + 1, col, value: v })
    }
  }
  return anomalies
}

function parseCSVGeneric(text, cols, codeCols = []) {
  const allRows = parseCSVRows(text)
  if (allRows.length < 2) return { rows: [], error: 'El archivo está vacío.' }
  const headers = allRows[0]
  const missing = cols.filter(c => !headers.includes(c))
  if (missing.length) return { rows: [], error: `Columnas faltantes: ${missing.join(', ')}` }
  for (let i = 1; i < allRows.length; i++) {
    const vals = allRows[i]
    if (vals.length !== headers.length) {
      return { rows: [], error: `Fila ${i + 1}: tiene ${vals.length} columnas, se esperaban ${headers.length}. `
        + `Probablemente hay una coma sin comillas dentro de un texto (ej. en un nombre) que descuadra las columnas siguientes.` }
    }
  }
  const anomalies = findCodeAnomalies(allRows, headers, codeCols)
  if (anomalies.length) {
    const MAX = 25
    const detalle = anomalies.slice(0, MAX)
      .map(a => `Fila ${a.line}, columna ${a.col}: "${a.value}"`)
      .join('\n')
    const resto = anomalies.length > MAX ? `\n… y ${anomalies.length - MAX} filas más con el mismo problema.` : ''
    return { rows: [], error:
      `${anomalies.length} fila(s) parecen venir descuadradas: traen texto largo en una columna que debería ser un código corto `
      + `(seguramente por un campo vacío que el CSV de origen omitió en vez de dejarlo en blanco).\n\n${detalle}${resto}\n\n`
      + `Corrige esas filas en el archivo de origen y vuelve a subirlo.` }
  }
  const rows = allRows.slice(1).map(vals => Object.fromEntries(headers.map((h, idx) => [h, vals[idx] ?? ''])))
  return { rows, error: null }
}

function downloadText(text, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  a.download = filename
  a.click()
}

function fmtDT(val) { return val ? String(val).slice(0, 16).replace('T', ' ') : '—' }

function mapHubRow(r) {
  return {
    orgCode:           r.OrgCode,
    itemCode:          r.ItemCode,
    masterCode:        r.MasterCode,
    shortName:         r.ShortName,
    longName:          r.LongName,
    price:             parseFloat(r.Price) || null,
    barcode:           r.Barcode,
    trayCapacity:      parseInt(r.TrayCapacity) || null,
    trayChecking:      r.TrayChecking,
    containerCapacity: parseInt(r.ContainerCapacity) || null,
    trayCode:          r.TrayCode,
    containerCode:     r.ContainerCode,
    shelfLife:         r.ShelfLife,
    daysLife:          parseFloat(r.DaysLife) || null,
    brand:             r.Brand,
    roundingFactor:    parseFloat(r.RoundingFactor) || null,
    categoryItem:      r.CategoryItem,
    bedsPerContainer:  parseInt(r.BedsPerContainer) || null,
    roundingCap:       parseFloat(r.RoundingCap) || null,
  }
}

function mapRtmRow(r) {
  return {
    productId:            r.Product_Id,
    productCode:          r.Product_code,
    productGlobalCode:    r.Product_Global_Code,
    productFullDesc:      r.Product_Full_Desc,
    productShortDesc:     r.Product_Short_Desc,
    companyCode:          r.Company_Code,
    companyName:          r.Company_Name,
    brandCode:            r.Brand_Code,
    brandName:            r.Brand_Name,
    categoryCode:         r.Category_Code,
    categoryName:         r.Category_Name,
    segmentCode:          r.Segment_Code,
    segmentName:          r.Segment_Name,
    lineCode:             r.Line_Code,
    lineName:             r.Line_Name,
    baseUom:              r.Base_Uom,
    primarySalesUom:      r.PrimarySalesUOM,
    weight:               parseFloat(r.Weight) || null,
    pack1Size:            parseFloat(r.Pack1_Size) || null,
    pack2Size:            parseFloat(r.Pack2_Size) || null,
    piecePrice:           parseFloat(r.Piece_Price) || null,
    productBarCode:       r.Product_BarCode,
    sequence:             parseInt(r.Sequence) || null,
    isSalable:            r.IsSalable,
    isReturnable:         r.IsReturnable,
    trayCode:             r.Tray_Code,
    claveProd:            r.Clave_Prod,
    claveUnidad:          r.Clave_Unidad,
    shelfLife:            parseFloat(r.Shelf_Life) || null,
    returnRate:           parseFloat(r.Return_Rate) || null,
    basePriceSalesCenter: parseFloat(r.Base_Price_Sales_Center) || null,
    unitMeasure:          r.Unit_Measure,
    mrp:                  r.MRP,
    instance:             r.Instance,
    active:               r.Active,
  }
}

function rtmRowToCsv(r) {
  return [r.productId,r.productCode,r.productGlobalCode,r.productFullDesc,r.productShortDesc,
    r.companyCode,r.companyName,r.brandCode,r.brandName,r.categoryCode,r.categoryName,
    r.segmentCode,r.segmentName,r.lineCode,r.lineName,r.baseUom,r.primarySalesUom,r.weight,
    r.pack1Size,r.pack2Size,r.piecePrice,r.productBarCode,r.sequence,r.isSalable,r.isReturnable,
    r.trayCode,r.claveProd,r.claveUnidad,r.shelfLife,r.returnRate,r.basePriceSalesCenter,
    r.unitMeasure,r.mrp,r.instance,r.active].join(',')
}

function hubRowToCsv(r) {
  return [r.orgCode,r.itemCode,r.masterCode,r.shortName,r.longName,r.price,r.barcode,
    r.trayCapacity,r.trayChecking,r.containerCapacity,r.trayCode,r.containerCode,
    r.shelfLife,r.daysLife,r.brand,r.roundingFactor,r.categoryItem,r.bedsPerContainer,r.roundingCap].join(',')
}

/** Sección genérica de carga CSV + historial de cargas, reutilizada por HubPedidos y RTM. */
function CargaCsvSection({ apiPath, cols, codeCols, template, templateFilename, previewCols, mapRow, rowToCsv, exportFilenamePrefix, dropHint, unitLabel }) {
  const [file, setFile]             = useState(null)
  const [rows, setRows]             = useState([])
  const [parseError, setParseError] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [saveResult, setSaveResult] = useState(null)
  const [batches, setBatches]       = useState([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [viewBatch, setViewBatch]   = useState(null)
  const [viewRows, setViewRows]     = useState([])
  const [loadingView, setLoadingView] = useState(false)
  const inputRef = useRef()

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true)
    try {
      const r = await fetch(`${API}${apiPath}/batches`)
      setBatches(r.ok ? await r.json() : [])
    } catch { setBatches([]) }
    finally { setLoadingBatches(false) }
  }, [apiPath])

  useEffect(() => { loadBatches() }, [loadBatches])

  const handleFile = (f) => {
    if (!f) return
    setSaveResult(null)
    setFile(f)
    const reader = new FileReader()
    reader.onload = e => {
      const { rows: parsed, error } = parseCSVGeneric(e.target.result, cols, codeCols)
      setParseError(error)
      setRows(parsed)
    }
    reader.readAsText(f, 'UTF-8')
  }

  const handleSave = async () => {
    if (!rows.length) return
    setSaving(true)
    setSaveResult(null)
    const batchId = crypto.randomUUID()
    const mapped = rows.map(mapRow)
    const CHUNK = 5_000
    let saved = 0
    try {
      for (let i = 0; i < mapped.length; i += CHUNK) {
        const res = await fetch(`${API}${apiPath}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, rows: mapped.slice(i, i + CHUNK) }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.detail || d.error || d.title || `HTTP ${res.status}`)
        }
        const d = await res.json()
        saved += d.saved ?? CHUNK
        setSaveResult({ ok: true, msg: `Guardando... ${saved.toLocaleString()} / ${rows.length.toLocaleString()} ${unitLabel}` })
      }
      setSaveResult({ ok: true, msg: `✓ ${saved.toLocaleString()} ${unitLabel} guardados.` })
      setFile(null); setRows([])
      await loadBatches()
    } catch (e) {
      setSaveResult({ ok: false, msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  const handleView = async (batch) => {
    setViewBatch(batch)
    setLoadingView(true)
    try {
      const r = await fetch(`${API}${apiPath}/batches/${batch.batchId}`)
      setViewRows(r.ok ? await r.json() : [])
    } catch { setViewRows([]) }
    finally { setLoadingView(false) }
  }

  const handleDelete = async (batchId) => {
    if (!confirm('¿Eliminar esta carga?')) return
    await fetch(`${API}${apiPath}/batches/${batchId}`, { method: 'DELETE' })
    setBatches(b => b.filter(x => x.batchId !== batchId))
    if (viewBatch?.batchId === batchId) setViewBatch(null)
  }

  const handleDownload = async (batch) => {
    const r = await fetch(`${API}${apiPath}/batches/${batch.batchId}`)
    if (!r.ok) return
    const data = await r.json()
    const csv = [cols.join(','), ...data.map(rowToCsv)].join('\n')
    downloadText(csv, `${exportFilenamePrefix}_${batch.batchId.slice(0, 8)}.csv`)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        <button className="btn" onClick={() => downloadText(template, templateFilename)}>⬇ Template CSV</button>
        <button className="btn primary" onClick={() => inputRef.current.click()}>↑ Cargar CSV</button>
        <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
      </div>

      {saveResult && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 14,
          background: saveResult.ok ? '#ecfdf5' : '#fef2f2',
          color:      saveResult.ok ? '#065f46'  : '#991b1b',
          border:     `1px solid ${saveResult.ok ? '#6ee7b7' : '#fca5a5'}` }}>
          {saveResult.msg}
        </div>
      )}
      {parseError && (
        <div className="error-msg" style={{ whiteSpace: 'pre-line' }}>{parseError}
          <button className="btn" style={{ marginLeft: 10 }} onClick={() => { setFile(null); setRows([]); setParseError(null) }}>Reintentar</button>
        </div>
      )}

      {file && !parseError && rows.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <span style={{ fontWeight: 600 }}>{file.name}</span>
              <span style={{ marginLeft: 10, fontSize: 12, color: '#6b7280' }}>{rows.length.toLocaleString()} {unitLabel}</span>
            </div>
            <button className="btn" onClick={() => { setFile(null); setRows([]) }}>✕ Cancelar</button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
            <table>
              <thead><tr>{previewCols.map(c => <th key={c}>{c}</th>)}<th>...</th></tr></thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    {previewCols.map(c => <td key={c}>{r[c]}</td>)}
                    <td style={{ color: '#9ca3af', fontSize: 11 }}>+{cols.length - previewCols.length} cols</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && <div style={{ padding: '6px 12px', fontSize: 12, color: '#9ca3af', borderTop: '1px solid var(--border)' }}>Mostrando 50 de {rows.length.toLocaleString()}</div>}
          </div>
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '9px 0' }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : `☁ Guardar ${rows.length.toLocaleString()} ${unitLabel} en la base de datos`}
          </button>
        </div>
      )}

      {!file && !saveResult && (
        <div
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current.click()}
          style={{ border: '2px dashed #d1d5db', borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: '#f0f4ff', marginBottom: 20 }}
        >
          <div style={{ fontSize: 28, marginBottom: 8, color: '#475569' }}>◉</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e3a8a' }}>Arrastra el CSV aquí o haz clic para seleccionarlo</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 5 }}>{dropHint} · {cols.length} columnas</div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>Historial de cargas</span>
          <span style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>{batches.length} cargas</span>
        </div>
        <button className="btn" onClick={loadBatches}>↻ Actualizar</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Batch ID</th>
              <th style={{ textAlign: 'right' }}>Filas</th>
              <th>Cargado</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loadingBatches ? (
              <tr><td colSpan={4} className="loading">Cargando...</td></tr>
            ) : batches.length === 0 ? (
              <tr><td colSpan={4} className="empty">Sin cargas. Sube tu primer CSV arriba.</td></tr>
            ) : batches.map(b => (
              <tr key={b.batchId}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#4b5563' }}>{b.batchId}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(b.filas).toLocaleString()}</td>
                <td style={{ fontSize: 12, color: '#6b7280' }}>{fmtDT(b.cargadoEn)}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 12px', fontWeight: 500 }} onClick={() => handleView(b)}>Ver</button>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 12px', color: '#475569', borderColor: '#d1d5db', background: '#f3f4f6', fontWeight: 600 }} onClick={() => handleDownload(b)}>↓ CSV</button>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 12px', color: '#991b1b', borderColor: '#fca5a5', background: '#fef2f2', fontWeight: 600 }} onClick={() => handleDelete(b.batchId)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewBatch && (
        <div style={{ marginTop: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Detalle — </span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#9ca3af' }}>{viewBatch.batchId}</span>
            </div>
            <button className="btn" onClick={() => setViewBatch(null)}>✕ Cerrar</button>
          </div>
          {loadingView ? <div className="loading">Cargando...</div> : (
            <div style={{ maxHeight: 360, overflowY: 'auto', overflowX: 'auto' }}>
              <table>
                <thead><tr>{previewCols.map(c => <th key={c}>{c}</th>)}<th>+{cols.length - previewCols.length} cols</th></tr></thead>
                <tbody>
                  {viewRows.slice(0, 200).map((r, i) => {
                    const camel = previewCols.map(c => c.replace(/_([A-Za-z0-9])/g, (_, ch) => ch.toUpperCase()))
                    return (
                      <tr key={i}>
                        {camel.map((c0, idx) => {
                          const key = c0.charAt(0).toLowerCase() + c0.slice(1)
                          return <td key={idx}>{r[key]}</td>
                        })}
                        <td style={{ color: '#9ca3af', fontSize: 11 }}>…</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {viewRows.length > 200 && <div style={{ padding: '6px 12px', fontSize: 12, color: '#9ca3af', borderTop: '1px solid var(--border)' }}>Mostrando 200 de {viewRows.length.toLocaleString()}</div>}
            </div>
          )}
        </div>
      )}
    </>
  )
}

const TABS = [
  { key: 'hub', label: 'HubPedidos', sub: 'Catálogo de productos exportado desde HubPedidos (item master)' },
  { key: 'rtm', label: 'RTM',        sub: 'Catálogo de productos desde M05_ProductMaster (RTM)' },
]

export default function CatalogoProductos() {
  const [tab, setTab] = useState('hub')
  const active = TABS.find(t => t.key === tab)

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Productos {active.label}</div>
          <div className="topbar-sub">{active.sub}</div>
        </div>
      </div>

      <div className="content">
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 18px', fontSize: 13, fontWeight: 600, background: 'none', border: 'none',
                cursor: 'pointer', color: tab === t.key ? '#475569' : '#6b7280',
                borderBottom: tab === t.key ? '2px solid #475569' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'hub' && (
          <CargaCsvSection
            apiPath="/api/productos-hub"
            cols={COLS}
            codeCols={CODE_COLS}
            template={TEMPLATE}
            templateFilename="template_productos_hub.csv"
            previewCols={PREVIEW_COLS}
            mapRow={mapHubRow}
            rowToCsv={hubRowToCsv}
            exportFilenamePrefix="productos_hub"
            dropHint="Exporta desde HubPedidos → Item Master"
            unitLabel="productos"
          />
        )}

        {tab === 'rtm' && (
          <CargaCsvSection
            apiPath="/api/rtm"
            cols={RTM_COLS}
            codeCols={RTM_CODE_COLS}
            template={RTM_TEMPLATE}
            templateFilename="template_rtm.csv"
            previewCols={RTM_PREVIEW_COLS}
            mapRow={mapRtmRow}
            rowToCsv={rtmRowToCsv}
            exportFilenamePrefix="productos_rtm"
            dropHint="Exporta desde RTM → M05_ProductMaster"
            unitLabel="productos"
          />
        )}
      </div>
    </>
  )
}
