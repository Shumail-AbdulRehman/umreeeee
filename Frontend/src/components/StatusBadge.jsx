import { Badge } from './ui/badge'
import { readable } from '../lib/format'

export default function StatusBadge({ status, children }) {
  const value = String(status || '').toLowerCase()
  const tone = ['active', 'allowed', 'resolved', 'completed', 'pass', 'reviewed'].includes(value) ? 'success'
    : /blocked|fail|unsafe|suspended|high|critical/.test(value) ? 'danger'
      : /error|interrupted|pending|invited|inconclusive|cancelling/.test(value) ? 'warning'
        : /running|processing|queued|protected/.test(value) ? 'accent' : 'neutral'
  return <Badge variant="outline" className={`status-badge status-${tone}`}><span className="status-dot" aria-hidden="true" />{children || readable(status)}</Badge>
}
