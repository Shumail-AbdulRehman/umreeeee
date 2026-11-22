import { ArrowUpRight, Inbox, Search, CalendarDays, ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { formatNumber } from '../lib/format'

export function SectionHeader({ title, description, eyebrow, action }) {
  return <header className="section-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>
}
export function EmptyState({ title = 'Nothing to show yet', description, icon: Icon = Inbox, action }) {
  return <div className="empty-state"><div className="empty-state-icon"><Icon size={23} aria-hidden="true" /></div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>
}
export function StatCard({ title, value, description, icon: Icon, href, tone = 'accent' }) {
  return <article className={`stat-card stat-${tone}`}><div className="stat-top"><span>{title}</span>{Icon && <Icon size={17} aria-hidden="true" />}</div><strong className="stat-value">{value}</strong><div className="stat-bottom"><p>{description}</p>{href && <a href={href} aria-label={`Explore ${title.toLowerCase()}`}><ArrowUpRight size={17} /></a>}</div></article>
}
export function SearchInput({ label, ...props }) {
  return <div className="search-field"><Search size={16} aria-hidden="true" /><Input type="search" aria-label={label} {...props} /></div>
}
export function PeriodLabel({ children = 'Last 7 days · UTC' }) {
  return <span className="period-label"><CalendarDays size={14} aria-hidden="true" />{children}</span>
}
export function Pagination({ page, pageSize = 20, total, onPageChange, noun = 'records' }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <nav className="table-pagination" aria-label={`${noun} pagination`}><span>{total ? `${formatNumber((page - 1) * pageSize + 1)}–${formatNumber(Math.min(page * pageSize, total))} of ${formatNumber(total)}` : '0'} {noun}</span><div><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page"><ArrowLeft size={14} /><span>Previous</span></Button><span className="pagination-page">{page} / {pages}</span><Button variant="outline" size="sm" disabled={page * pageSize >= total} onClick={() => onPageChange(page + 1)} aria-label="Next page"><span>Next</span><ArrowRight size={14} /></Button></div></nav>
}
