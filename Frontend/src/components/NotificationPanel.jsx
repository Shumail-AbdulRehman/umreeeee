import { useEffect, useState } from 'react'
import { listNotifications, markNotificationRead } from '../services/observability'

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
  return <div className="notification-panel"><button className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>Alerts {items.length ? `(${items.length})` : ''}</button>{open && <div className="notification-popover"><strong>Unread alerts</strong>{error && <p className="admin-error" role="alert">{error}</p>}{items.length === 0 ? <p>No unread alerts.</p> : items.map((item) => <div key={item._id}><p>{item.title}: {item.summary}</p><button className="btn" onClick={() => read(item)}>Open and mark read</button></div>)}</div>}</div>
}
