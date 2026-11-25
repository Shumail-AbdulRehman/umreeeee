import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { getPlatformCompany, listPlatformAudit, listPlatformCompanies } from './platformService'
import { usePlatformResource } from './usePlatformResource'
import { AuditTable, EmptyState, ErrorState, LoadingState, PageHeading, Pagination } from './PlatformComponents'

const EVENTS = [
  ['platform.organization_status_changed', 'Company access changed'],
  ['auth.signup', 'Company registered'],
  ['auth.email_verified', 'Email verified'],
  ['auth.invitation_accepted', 'Invitation accepted'],
  ['integration.created', 'Integration created'],
  ['integration.updated', 'Integration updated'],
  ['integration.status_changed', 'Integration status changed'],
  ['policy_set.created', 'Policy created'],
  ['policy_set.updated', 'Policy updated'],
  ['policy_set.groups_updated', 'Policy assignments changed'],
  ['policy_set.status_changed', 'Policy status changed'],
  ['policy.created', 'Custom policy created'],
  ['policy.updated', 'Custom policy updated'],
  ['policy.status_changed', 'Custom policy status changed'],
  ['policy.groups_updated', 'Catalog assignments updated'],
  ['policy.group_checks_updated', 'Policy checks updated'],
  ['policy.catalog_imported', 'Policy catalog imported'],
  ['violation.resolved', 'Violation status changed'],
  ['settings.updated', 'Company settings updated'],
]
const PAGE_SIZE = 20
const COMPANY_PAGE_SIZE = 8

function pageNumber(value) {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function CompanyFilter({ value, observedName, onChange }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const details = useRef(null)
  const trigger = useRef(null)
  const searchInput = useRef(null)
  const id = useId()
  const selected = usePlatformResource(
    (signal) => value && !observedName ? getPlatformCompany(value, { days: 7, signal }) : Promise.resolve(null),
    [value, observedName],
  )
  const result = usePlatformResource(
    (signal) => open ? listPlatformCompanies({ days: 7, page, page_size: COMPANY_PAGE_SIZE, q: query, sort: 'name', signal }) : Promise.resolve(null),
    [open, page, query],
  )

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(draft); setPage(1) }, 250)
    return () => clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    if (!open) return undefined
    const closeOutside = (event) => {
      if (details.current && !details.current.contains(event.target)) details.current.open = false
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  const close = () => {
    if (details.current) details.current.open = false
    setOpen(false)
    trigger.current?.focus()
  }
  const choose = (companyId) => { onChange(companyId); close() }
  const changePage = (nextPage) => {
    // The result buttons unmount during loading; retain keyboard control in the picker.
    searchInput.current?.focus()
    setPage(nextPage)
  }
  const selectedName = observedName || selected.data?.company?.name || 'Selected company'

  return <details className="company-filter filter-field" ref={details} onToggle={(event) => setOpen(event.currentTarget.open)}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close() }
    }}>
    <summary className="button" ref={trigger} aria-controls={open ? id : undefined} aria-label={`Filter by company: ${value ? selectedName : 'All companies'}`}>
      {value ? selectedName : 'All companies'}<ChevronDown size={14} aria-hidden="true" />
    </summary>
    {open && <div className="company-picker-popover" id={id}>
      <label className="search-field company-picker-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Find a company</span>
        <input ref={searchInput} type="search" value={draft} maxLength={120} placeholder="Search name or slug" autoComplete="off"
          onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button className="company-picker-option" type="button" onClick={() => choose(null)}>All companies</button>
      {result.loading ? <LoadingState label="Loading company choices…" /> : result.error ? <ErrorState error={result.error} onRetry={result.reload} /> : result.data ? <>
        <ul className="company-picker-options" aria-label="Company choices">
          {result.data.items.map((company) => <li key={company.id}><button className="company-picker-option" type="button"
            aria-current={value === company.id ? 'true' : undefined} onClick={() => choose(company.id)}>{company.name}</button></li>)}
        </ul>
        {!result.data.items.length && <p className="muted">No companies found.</p>}
        <div className="company-picker-pagination">
          <span>{result.data.total} companies</span>
          <button className="button" type="button" aria-label="Previous companies" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button>
          <button className="button" type="button" aria-label="Next companies" disabled={page * COMPANY_PAGE_SIZE >= result.data.total} onClick={() => changePage(page + 1)}>Next</button>
        </div>
      </> : null}
    </div>}
  </details>
}

export default function PlatformAudit({ params = new URLSearchParams(), onParamsChange }) {
  const companyId = params.get('company_id') || ''
  const eventType = params.get('event_type') || ''
  const days = ['7', '30'].includes(params.get('days')) ? Number(params.get('days')) : undefined
  const page = pageNumber(params.get('page'))
  const { data, error, loading, reload } = usePlatformResource(
    (signal) => listPlatformAudit({ company_id: companyId, event_type: eventType, days, page, page_size: PAGE_SIZE, signal }),
    [companyId, eventType, days, page],
  )
  const knownEvents = new Map(EVENTS)
  for (const event of data?.items || []) if (!knownEvents.has(event.action)) knownEvents.set(event.action, event.event)
  if (eventType && !knownEvents.has(eventType)) knownEvents.set(eventType, eventType.replaceAll('_', ' ').replaceAll('.', ' · '))
  const observedName = data?.items.find((event) => event.company_id === companyId)?.company_name
  const changeFilter = (key, value) => onParamsChange({ [key]: value || null, page: null })
  const hasFilters = Boolean(companyId || eventType || days)

  return <>
    <PageHeading title="Audit log" description="Review company milestones and platform access changes." />
    <section className="panel directory-panel" aria-label="Audit events">
      <div className="toolbar">
        <CompanyFilter value={companyId} observedName={observedName} onChange={(value) => changeFilter('company_id', value)} />
        <div className="filter-field"><label className="sr-only" htmlFor="platform-audit-type">Event type</label>
          <select id="platform-audit-type" value={eventType} onChange={(event) => changeFilter('event_type', event.target.value)}>
            <option value="">All event types</option>{[...knownEvents].map(([action, label]) => <option key={action} value={action}>{label}</option>)}
          </select>
        </div>
        <div className="filter-field"><label className="sr-only" htmlFor="platform-audit-days">Event date</label>
          <select id="platform-audit-days" value={days || ''} onChange={(event) => changeFilter('days', event.target.value)}>
            <option value="">All dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
          </select>
        </div>
      </div>
      {loading ? <LoadingState label="Loading audit events…" /> : error ? <ErrorState error={error} onRetry={reload} /> : data ? <>
        {data.items.length ? <AuditTable items={data.items} /> : <EmptyState title={data.total ? 'No events on this page' : 'No matching events'}
          description={data.total ? 'Return to the first page to see the current audit events.' : hasFilters ? 'Try a different filter or check back after a company change.' : 'Company milestones and platform access changes appear here.'}>
          {data.total ? <button className="button" type="button" onClick={() => onParamsChange({ page: null })}>First page</button>
            : hasFilters && <button className="button" type="button" onClick={() => onParamsChange({ company_id: null, event_type: null, days: null, page: null })}>Clear filters</button>}
        </EmptyState>}
        <Pagination page={page} pageSize={data.page_size || PAGE_SIZE} total={data.total}
          onPageChange={(next) => onParamsChange({ page: next === 1 ? null : String(next) })} noun="events" />
        <span className="sr-only" role="status">{data.total} audit events found.</span>
      </> : null}
    </section>
  </>
}
