import { useEffect, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { listNotifications, markNotificationRead } from '../services/observability'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Button } from './ui/button'
import { EmptyState } from './Surface'
export default function NotificationPanel() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true; let timer; let delay = 15000
    async function refresh() {
      if (!active) return
      if (document.hidden) { timer = setTimeout(refresh, delay); return }
      try { const result = await listNotifications('?unread=true&page_size=20'); if (active) setItems(result.items); delay = 15000 }
      catch { delay = Math.min(delay * 2, 120000) }
      timer = setTimeout(refresh, delay)
    }
    refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [])
  async function read(item) {
    try { await markNotificationRead(item._id); setItems((current) => current.filter((entry) => entry._id !== item._id)); setError(''); window.location.assign(item.resource_type === 'red_team_test' ? `#red-team?test=${encodeURIComponent(item.resource_id)}` : '#violations') }
    catch (problem) { setError(problem.message) }
  }
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="ghost" size="icon" className="notification-trigger" aria-label={`Alerts${items.length ? ` (${items.length} unread)` : ''}`}><Bell size={17} />{items.length > 0 && <span className="notification-count">{items.length}</span>}</Button></PopoverTrigger><PopoverContent align="end" className="notification-popover"><div className="notification-heading"><strong>Notifications</strong><span>{items.length} unread</span></div>{error && <p className="admin-error" role="alert">{error}</p>}{items.length === 0 ? <EmptyState icon={CheckCheck} title="You're all caught up" description="New policy and evaluation alerts will appear here." /> : items.map((item) => <div className="notification-item" key={item._id}><strong>{item.title}</strong><p>{item.summary}</p><Button variant="outline" size="sm" onClick={() => read(item)}>Open and mark read</Button></div>)}</PopoverContent></Popover>
}
