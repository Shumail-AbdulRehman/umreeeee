import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Building2, ChevronRight, ClipboardList, Layers3, LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import BrandMark from '../../components/BrandMark'
import { formatDate } from './platformFormat'
import './platform.css'

const links = [
  { key: 'overview', href: '#platform-overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'companies', href: '#platform-companies', label: 'Companies', icon: Building2 },
  { key: 'audit', href: '#platform-audit', label: 'Audit log', icon: ClipboardList },
]

export default function PlatformShell({ user, route = 'platform-overview', companyName, generatedAt, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const mainRef = useRef(null)
  const navigationRef = useRef(null)
  const menuRef = useRef(null)
  const previousRoute = useRef(route)
  const normalizedRoute = String(route).replace(/^platform-/, '')
  const selected = normalizedRoute === 'company' || normalizedRoute === 'companies' ? 'companies' : normalizedRoute === 'audit' ? 'audit' : 'overview'
  const label = links.find((link) => link.key === selected).label
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Platform owner'
  const initials = [user?.first_name, user?.last_name].filter(Boolean).map((part) => part[0]).join('').toUpperCase() || 'PO'

  useEffect(() => {
    if (previousRoute.current === route) return
    previousRoute.current = route
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo?.(0, 0)
  }, [route])

  useEffect(() => {
    if (mobileOpen) navigationRef.current?.querySelector('[aria-current="page"]')?.focus()
  }, [mobileOpen])

  function closeMenu(restoreFocus = false) {
    setMobileOpen(false)
    if (restoreFocus) menuRef.current?.focus()
  }

  return <div className="platform-workspace">
    <a className="skip-link" href="#platform-main" onClick={(event) => { event.preventDefault(); mainRef.current?.focus() }}>Skip to main content</a>
    <div className={`shell ${mobileOpen ? 'menu-open' : ''}`}>
      <aside className="sidebar" id="platform-sidebar" onKeyDown={(event) => { if (event.key === 'Escape' && mobileOpen) { event.preventDefault(); closeMenu(true) } }}>
        <a className="brand" href="#platform-overview" aria-label="Averiq platform overview"><span className="brand-mark"><BrandMark size={23} /></span><span>Averiq</span></a>
        <div className="workspace"><span className="workspace-mark"><Layers3 aria-hidden="true" /></span><div><strong>Platform workspace</strong><small>Cross-company view</small></div></div>
        <nav className="nav" aria-label="Platform" ref={navigationRef}>{links.map(({ key, href, label: name, icon: Icon }) => <a key={key} href={href} aria-current={selected === key ? 'page' : undefined} onClick={() => closeMenu(mobileOpen && href === `#${route}`)}><span><Icon aria-hidden="true" /></span>{name}</a>)}</nav>
        <div className="sidebar-footer"><a className="workspace-return" href="#insights" onClick={() => closeMenu()}><ArrowLeft aria-hidden="true" /><span>Your organization</span></a><div className="sidebar-account"><span className="avatar" aria-hidden="true">{initials}</span><div><strong>{displayName}</strong><small>Super admin</small></div></div><button className="platform-signout" type="button" onClick={onLogout}><LogOut aria-hidden="true" />Sign out</button></div>
      </aside>
      <div className="workarea">
        <header className="topbar"><div className="topbar-start"><button className="icon-button mobile-menu" ref={menuRef} type="button" aria-controls="platform-sidebar" aria-expanded={mobileOpen} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMobileOpen((open) => !open)}>{mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button><nav className="crumb" aria-label="Breadcrumb"><span>Platform</span><ChevronRight aria-hidden="true" />{normalizedRoute === 'company' ? <><a href="#platform-companies">Companies</a><ChevronRight aria-hidden="true" /><span aria-current="page">{companyName || 'Company detail'}</span></> : <span aria-current="page">{label}</span>}</nav></div><span className="data-stamp" title={generatedAt ? `Data as of ${formatDate(generatedAt)}` : 'Company metadata and recorded workspace activity'}><span aria-hidden="true" />{generatedAt ? `As of ${new Date(generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC` : 'Platform data'}</span></header>
        <main id="platform-main" ref={mainRef} tabIndex={-1}>{children}</main>
      </div>
    </div>
  </div>
}
