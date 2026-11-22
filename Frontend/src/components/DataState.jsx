import { AlertCircle } from 'lucide-react'
import LoadingSurface from './LoadingSurface'
export function LoadingState({ title = 'Loading dashboard data…' }) { return <LoadingSurface label={title} /> }
export function ErrorState({ error, title = 'Could not load dashboard data' }) {
  return <div className="error-surface" role="alert"><AlertCircle size={23} /><div><h2>{title}</h2><p>{error?.message || 'The data source could not respond. Please try again.'}</p><button className="btn" onClick={() => window.location.reload()}>Reload page</button></div></div>
}
