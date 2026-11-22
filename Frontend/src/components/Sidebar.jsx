import BrandMark from './BrandMark'
import { useState } from 'react'
import { BarChart3, Activity, ArrowLeftToLine, ArrowRightFromLine, Bot, CircleDollarSign, Clock3, FlaskConical, Layers3, LayoutDashboard, LockKeyhole, LogOut, Menu, MessageSquare, Plug, Settings2, ShieldCheck, TriangleAlert, Users, X } from 'lucide-react'
import { pageGroups } from '../config/navigation'
import { isAdmin } from '../utils/permissions'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

const icons = { 'prompt-studio': MessageSquare, insights: LayoutDashboard, 'my-activity': BarChart3, 'activity-log': Activity, violations: TriangleAlert, catalog: Bot, latency: Clock3, spend: CircleDollarSign, users: Users, 'user-insights': BarChart3, inventory: Layers3, integrations: Plug, settings: Settings2, 'dlp-policy': LockKeyhole, 'guardrail-policy': ShieldCheck, 'red-team': FlaskConical }
export default function Sidebar({ page, onNavigate, user, onLogout, collapsed, onToggleCollapse }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const admin = isAdmin(user)
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ')
  const initials = [user.first_name, user.last_name].filter(Boolean).map((part) => part[0]).join('').toUpperCase()
  const groups = pageGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.key !== 'settings' && (!item.admin || admin) && (!item.member || !admin)) })).filter((group) => group.items.length)
  function navigationItem(item, mobile) {
    const Icon = icons[item.key] || Bot
    const button = <button type="button" className={`nav-item ${page === item.key ? 'active' : ''}`} aria-label={item.label} aria-current={page === item.key ? 'page' : undefined} onClick={() => { onNavigate(item.key); setMobileOpen(false) }}><Icon size={18} aria-hidden="true" /><span className="nav-item-label">{item.label}</span>{page === item.key && <span className="nav-active-dot" aria-hidden="true" />}</button>
    return collapsed && !mobile ? <Tooltip key={item.key}><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent side="right">{item.label}</TooltipContent></Tooltip> : <div key={item.key}>{button}</div>

  }
  function navigation(mobile = false) {
    return <><div className="workspace-identity"><span className="workspace-monogram">{user.company?.name?.slice(0, 1) || 'W'}</span><div><strong>{user.company?.name || 'Workspace'}</strong><small>{admin ? 'Organization workspace' : 'Personal workspace'}</small></div></div><nav aria-label="Main navigation" className="side-navigation">{groups.map((group) => <div className="nav-section" key={group.title}><h2 className="nav-label">{group.title}</h2>{group.items.map((item) => navigationItem(item, mobile))}</div>)}</nav><div className="side-foot">{admin && <nav className="sidebar-settings" aria-label="Workspace settings">{navigationItem({ key: 'settings', label: 'Settings' }, mobile)}</nav>}<div className="sidebar-account"><span className="avatar">{initials}</span><div className="user-copy"><strong>{displayName}</strong><small>{admin ? 'Administrator' : 'Workspace member'}</small></div></div><button className="sidebar-signout" type="button" onClick={onLogout} aria-label="Sign out"><LogOut size={16} /><span>Sign out</span></button><span className="sidebar-version">Averiq <span>{import.meta.env.PROD ? 'Production' : 'Development'}</span></span></div></>
  }
  return <><aside className={`side ${collapsed ? 'is-collapsed' : ''}`}><div className="brand"><span className="brand-mark"><BrandMark size={21} /></span><span className="brand-name">Averiq</span><button type="button" className="nav-collapse-toggle" onClick={onToggleCollapse} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>{collapsed ? <ArrowRightFromLine size={16} /> : <ArrowLeftToLine size={16} />}</button></div>{navigation()}</aside>
    <div className="mobile-brand"><span className="brand-mark"><BrandMark size={20} /></span><strong>Averiq</strong><button type="button" className="btn mobile-menu-toggle" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} />Menu</button></div>
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}><DialogContent className="mobile-navigation-dialog" showCloseButton={false}><div className="mobile-nav-heading"><DialogTitle>Averiq</DialogTitle><button className="btn" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button></div><DialogDescription className="sr-only">Navigate your organization workspace.</DialogDescription>{navigation(true)}</DialogContent></Dialog>
  </>
}
