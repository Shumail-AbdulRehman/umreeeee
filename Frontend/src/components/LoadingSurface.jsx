import './loading-surface.css'
import BrandMark from './BrandMark'
import { LoaderCircle } from 'lucide-react'
import PageSkeleton from './PageSkeleton'
export default function LoadingSurface({ kind = 'dashboard', label = 'Loading workspace data…' }) {
  if (kind === 'session') return <div className="loading-surface loading-session" role="status" aria-live="polite"><div className="session-brand-emblem" aria-hidden="true"><span className="session-emblem-frame"><BrandMark size={34} /></span></div><div className="session-brand-copy"><strong>Averiq</strong><span>Your AI workspace</span></div><div className="session-loading-status"><LoaderCircle size={16} aria-hidden="true" /><span>{label}</span></div><div className="session-loading-track" aria-hidden="true"><span /></div><p className="session-loading-note">Preparing your workspace.</p></div>
  const pageKind = kind === 'dashboard' ? 'insights' : kind === 'policy' ? 'policies' : kind
  return <div className={`loading-surface loading-${pageKind}`} role="status" aria-live="polite"><div className="loading-page-status"><LoaderCircle size={14} aria-hidden="true" /><span>{label}</span></div><PageSkeleton kind={pageKind} /></div>
}
export function InlineLoadingBar({ label = 'Updating…' }) {
  return <div className="inline-loading" role="status" aria-live="polite"><span>{label}</span><div className="loading-progress"><span /></div></div>
}
