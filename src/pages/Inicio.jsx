import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../App'

export default function Inicio() {
  const navigate = useNavigate()
  const [health, setHealth] = useState(null)

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then(r => r.json())
      .then(d => setHealth('ok'))
      .catch(() => setHealth('error'))
  }, [])

  const modules = [
    { to: '/cupos', icon: '▣', color: '#E6F1FB', iconColor: '#185FA5', title: 'Catálogo de cupos', desc: 'Cupos por CEVE, item y producto. Actualizado por la extensión Imweb.', tags: ['CEVE', 'Item', 'Cupo', 'Torre', 'Días min'] },
    { to: '/remisiones', icon: '⊡', color: '#E1F5EE', iconColor: '#0F6E56', title: 'Remisiones CEQ', desc: 'Encabezados de remisiones capturados del portal CEQ.', tags: ['Fecha', 'CEVE', 'Tipo', 'LOGIS', 'WMS'] },
    { to: '/productos', icon: '◫', color: '#FAEEDA', iconColor: '#854F0B', title: 'Productos CEQ', desc: 'Detalle de productos por remisión, extraídos del Excel del CEQ.', tags: ['SKU', 'Cantidad', 'Remisión'] },
    { to: '/subir', icon: '↑', color: '#EEEDFE', iconColor: '#534AB7', title: 'Carga manual', desc: 'Sube Excel/CSV con datos que no provienen de las extensiones.', tags: ['Excel', 'CSV'] },
  ]

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Inicio — resumen general</div>
          <div className="topbar-sub">Datos disponibles en la base de datos</div>
        </div>
        <div className="topbar-actions">
          <span style={{ fontSize: 12, color: health === 'ok' ? '#3B6D11' : health === 'error' ? '#a32d2d' : '#9b9b97' }}>
            {health === 'ok' ? '● API conectada' : health === 'error' ? '● API sin respuesta' : '● Verificando API...'}
          </span>
        </div>
      </div>

      <div className="content">
        <div className="section-label">Módulos disponibles</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {modules.map(m => (
            <div
              key={m.to}
              onClick={() => navigate(m.to)}
              style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: m.color, color: m.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {m.icon}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>{m.desc}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {m.tags.map(t => (
                  <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
