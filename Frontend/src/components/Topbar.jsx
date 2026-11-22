import { useEffect, useState } from 'react'
import { ChevronRight, Command, Search, LogOut, Settings2, ShieldCheck, UserRound } from 'lucide-react'
import { pageGroups, pageMeta } from '../config/navigation'
import { canOpenPage, isAdmin } from '../utils/permissions'
import NotificationPanel from './NotificationPanel'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from './ui/dropdown-menu'
import { SearchInput } from './Surface'

export default function Topbar({ page, user, onNavigate, onLogout }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const meta = pageMeta[page]
  useEffect(() => {
    function shortcut(event) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen((value) => !value) } }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [])
  const results = pageGroups.flatMap((group) => group.items.map((item) => ({ ...item, section: group.title }))).filter((item) => canOpenPage(user, item.key) && `${item.label} ${pageMeta[item.key].subtitle}`.toLowerCase().includes(query.toLowerCase()))
  return <header className="topbar"><nav className="crumb" aria-label="Breadcrumb"><span>{meta.section}</span><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">{meta.title}</span></nav><div className="topbar-actions"><Button variant="ghost" className="global-search-trigger" onClick={() => setSearchOpen(true)} aria-label="Search workspace pages"><Search size={16} /><span>Search workspace</span><kbd><Command size={10} />K</kbd></Button><NotificationPanel /><span className="topbar-divider" /><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="profile-trigger" aria-label="Open account menu"><span className="profile-avatar">{user?.first_name?.[0]}{user?.last_name?.[0]}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="account-menu"><DropdownMenuLabel><strong>{user?.first_name} {user?.last_name}</strong><small>{user?.email}</small></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem disabled><UserRound size={15} />{isAdmin(user) ? 'Administrator' : 'Workspace member'}</DropdownMenuItem><DropdownMenuItem disabled><ShieldCheck size={15} />{user?.company?.name}</DropdownMenuItem>{isAdmin(user) && <DropdownMenuItem onSelect={() => onNavigate('settings')}><Settings2 size={15} />Organization settings</DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem onSelect={onLogout}><LogOut size={15} />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent className="command-dialog"><DialogTitle>Find a workspace page</DialogTitle><DialogDescription>Search the pages available to your account.</DialogDescription><SearchInput label="Search workspace pages" placeholder="Search pages, policies, analytics…" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus /><div className="command-results">{results.length ? results.map((item) => <button key={item.key} onClick={() => { onNavigate(item.key); setSearchOpen(false); setQuery('') }}><span><strong>{item.label}</strong><small>{pageMeta[item.key].subtitle}</small></span><span>{item.section}<ChevronRight size={14} /></span></button>) : <p>No pages match “{query}”.</p>}</div></DialogContent></Dialog>
  </header>
}
