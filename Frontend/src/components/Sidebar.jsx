import { useState } from 'react'
import { pageGroups } from '../config/navigation'
import { isAdmin } from '../utils/permissions'

function getDisplayName(user) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
}

function getInitials(user) {
  return [user.first_name, user.last_name]
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

export default function Sidebar({ page, onNavigate, user, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const displayName = getDisplayName(user)
  const admin = isAdmin(user)
  const visibleGroups = pageGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.admin || admin),
  })).filter((group) => group.items.length)

  return (
    <aside className={`side ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand">
        <div className="brand-mark">S</div>
        <div className="brand-name">Sentinel AI</div>
        <div className="brand-env">local</div>
        <button type="button" className="btn mobile-menu-toggle" aria-expanded={mobileOpen} aria-controls="main-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? 'Close' : 'Menu'}</button>
      </div>

      <div className="side-navigation" id="main-navigation">
      {visibleGroups.map((group) => (
        <div className="nav-section" key={group.title}>
          <h2 className="nav-label">{group.title}</h2>
          {group.items.map((item) => (
            <button type="button" className={`nav-item ${page === item.key ? 'active' : ''}`} aria-current={page === item.key ? 'page' : undefined} key={item.key} onClick={() => { onNavigate(item.key); setMobileOpen(false) }}>
              <span className="ic">
                {item.key === 'dlp-policy' ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>
                  : item.key === 'guardrail-policy' ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></svg>
                  : <span className="inline-block h-3.5 w-3.5 rounded-full bg-current opacity-80" />}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ))}

      <div className="side-foot">
        <div className="user">
          <div className="avatar">{getInitials(user)}</div>
          <div>
            <div className="user-name">{displayName}</div>
            <div className="user-role">
              {[user.role, user.department, user.company?.name].filter(Boolean).join(' · ') || user.email}
            </div>
          </div>
        </div>
        <button type="button" className="btn logout-btn" onClick={onLogout}>
          Sign out
        </button>
      </div>
      </div>
    </aside>
  )
}
