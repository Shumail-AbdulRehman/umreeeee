import { useEffect, useState, useSyncExternalStore } from 'react'
import LoadingSurface from './LoadingSurface'
import { getActiveRequestCount, subscribeRequestActivity } from '../services/api/requestActivity'
import './page-loading.css'

export function RequestProgress() {
  const active = useSyncExternalStore(subscribeRequestActivity, getActiveRequestCount, getActiveRequestCount)
  if (!active) return null
  return <div className="request-progress" role="status" aria-label="Loading workspace data"><div className="loading-progress" role="progressbar" aria-label="Loading workspace data"><span /></div><span className="request-progress-label">Loading data…</span></div>
}

export default function PageLoadingBoundary({ label, kind = 'dashboard', children }) {
  const [initial, setInitial] = useState(true)

  useEffect(() => {
    let mounted = true
    let observedRequest = getActiveRequestCount() > 0
    const started = performance.now()
    let finishTimer
    const update = () => {
      clearTimeout(finishTimer)
      if (getActiveRequestCount() > 0) { observedRequest = true; return }
      if (observedRequest) {
        finishTimer = setTimeout(() => { if (mounted && getActiveRequestCount() === 0) setInitial(false) },
          Math.max(120, 380 - (performance.now() - started)))
      }
    }
    const unsubscribe = subscribeRequestActivity(update)
    const fallback = setTimeout(() => { if (mounted && !observedRequest && getActiveRequestCount() === 0) setInitial(false) }, 650)
    update()
    return () => { mounted = false; clearTimeout(finishTimer); clearTimeout(fallback); unsubscribe() }
  }, [])

  return <div className="page-loading-boundary">
    {initial && <LoadingSurface kind={kind} label={`Loading ${label}…`} />}
    <div className={initial ? 'page-loading-content is-pending' : 'page-loading-content'} aria-hidden={initial || undefined} inert={initial}>{children}</div>
  </div>
}
