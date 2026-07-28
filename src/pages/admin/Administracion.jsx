import { useState } from 'react'
import UsuariosPanel from './UsuariosPanel'
import RolesPanel from './RolesPanel'

const TABS = [
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'roles', label: 'Roles' },
]

export default function Administracion() {
  const [tab, setTab] = useState('usuarios')

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Usuarios y Roles</div>
          <div className="topbar-sub">Controla quién entra a la app y qué páginas puede ver cada quien</div>
        </div>
      </div>

      <div className="content">
        <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '9px 16px', fontSize: 13, fontWeight: 600,
                color: tab === t.key ? 'var(--accent)' : 'var(--text-3)',
                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'usuarios' ? <UsuariosPanel /> : <RolesPanel />}
      </div>
    </>
  )
}
