import { pageMeta } from '../config/navigation'
import NotificationPanel from './NotificationPanel'

export default function Topbar({ page }) {
  const meta = pageMeta[page]
  return <div className="topbar"><div className="crumb"><span>{meta.section}</span><span className="sep">/</span><b>{meta.title}</b></div><NotificationPanel /></div>
}
