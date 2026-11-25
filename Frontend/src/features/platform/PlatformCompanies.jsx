import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { listPlatformCompanies } from './platformService'
import { usePlatformResource } from './usePlatformResource'
import {
  CompanyTable, EmptyState, ErrorState, LoadingState, PageHeading, Pagination, PeriodControl,
} from './PlatformComponents'

const PAGE_SIZE = 8

function directoryPage(value) {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

export default function PlatformCompanies({ days = 7, onDaysChange, params = new URLSearchParams(), onParamsChange, onMetadata }) {
  const query = (params.get('q') || '').slice(0, 120)
  const access = ['active', 'suspended'].includes(params.get('access')) ? params.get('access') : ''
  const onboarding = ['ready', 'setup_incomplete', 'awaiting_admin'].includes(params.get('onboarding')) ? params.get('onboarding') : ''
  const activity = ['used', 'idle'].includes(params.get('activity')) ? params.get('activity') : ''
  const sort = ['runs', 'name', 'violations'].includes(params.get('sort')) ? params.get('sort') : 'runs'
  const page = directoryPage(params.get('page'))
  const [queryState, setQueryState] = useState({ source: query, draft: query })
  // URL changes (including browser Back and Clear filters) update the input without remounting it.
  if (queryState.source !== query) setQueryState({ source: query, draft: query })
  const draft = queryState.source === query ? queryState.draft : query

  useEffect(() => {
    if (draft === query) return undefined
    const timer = setTimeout(() => onParamsChange({ q: draft || null, page: null }), 300)
    return () => clearTimeout(timer)
  }, [draft, query, onParamsChange])

  const { data, error, loading, reload } = usePlatformResource(
    (signal) => listPlatformCompanies({ days, page, page_size: PAGE_SIZE, q: query, access, onboarding, activity, sort, signal }),
    [days, page, query, access, onboarding, activity, sort],
  )
  useEffect(() => {
    if (data) onMetadata?.({ generatedAt: data.generated_at })
  }, [data, onMetadata])
  const filtersApplied = Boolean(query || access || onboarding || activity)
  const changeFilter = (key, value) => onParamsChange({ [key]: value || null, page: null })
  const clearFilters = () => onParamsChange({ q: null, access: null, onboarding: null, activity: null, page: null })

  return <>
    <PageHeading title="Companies" description="Find companies and compare onboarding, access and usage.">
      <PeriodControl days={days} onChange={onDaysChange} />
    </PageHeading>
    <section className="panel directory-panel" aria-label="Companies directory">
      <div className="toolbar">
        <label className="search-field">
          <Search aria-hidden="true" />
          <span className="sr-only">Search companies</span>
          <input type="search" placeholder="Search name or slug" autoComplete="off" maxLength={120}
            value={draft} onChange={(event) => setQueryState({ source: query, draft: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && draft !== query) onParamsChange({ q: draft || null, page: null })
            }} />
        </label>
        <div className="filter-field">
          <label className="sr-only" htmlFor="platform-access-filter">Access status</label>
          <select id="platform-access-filter" value={access} onChange={(event) => changeFilter('access', event.target.value)}>
            <option value="">All access statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
          </select>
        </div>
        <div className="filter-field">
          <label className="sr-only" htmlFor="platform-onboarding-filter">Onboarding status</label>
          <select id="platform-onboarding-filter" value={onboarding} onChange={(event) => changeFilter('onboarding', event.target.value)}>
            <option value="">All onboarding states</option><option value="ready">Ready</option>
            <option value="setup_incomplete">Setup incomplete</option><option value="awaiting_admin">Awaiting admin</option>
          </select>
        </div>
        <div className="filter-field">
          <label className="sr-only" htmlFor="platform-activity-filter">Workspace activity</label>
          <select id="platform-activity-filter" value={activity} onChange={(event) => changeFilter('activity', event.target.value)}>
            <option value="">All activity</option><option value="used">Has submissions</option><option value="idle">No submissions</option>
          </select>
        </div>
        <div className="filter-field sort-field">
          <label className="sr-only" htmlFor="platform-sort-filter">Sort companies</label>
          <select id="platform-sort-filter" value={sort} onChange={(event) => changeFilter('sort', event.target.value)}>
            <option value="runs">Most submissions</option><option value="name">Company name</option><option value="violations">Most open violations</option>
          </select>
        </div>
      </div>
      {loading ? <LoadingState label="Loading companies…" /> : error ? <ErrorState error={error} onRetry={reload} /> : data ? <>
        {data.items.length ? <CompanyTable items={data.items} /> : <EmptyState title={data.total ? 'No companies on this page' : filtersApplied ? 'No companies found' : 'No companies yet'}
          description={data.total ? 'Return to the first page to see the current company results.' : filtersApplied ? 'Try a different name or clear the filters.' : 'Companies appear here after registration.'}>
          {data.total ? <button type="button" className="button" onClick={() => onParamsChange({ page: null })}>First page</button>
            : filtersApplied && <button type="button" className="button" onClick={clearFilters}>Clear filters</button>}
        </EmptyState>}
        <Pagination page={page} pageSize={data.page_size || PAGE_SIZE} total={data.total}
          onPageChange={(next) => onParamsChange({ page: next === 1 ? null : String(next) })} noun="companies" />
        <span className="sr-only" role="status">{data.total} companies found.</span>
      </> : null}
    </section>
  </>
}
