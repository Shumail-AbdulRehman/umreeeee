import { useId, useState } from 'react'
import { policyEntryId, policyEntryName } from '../utils/policyEntries'

const categoriesOf = (entry) => {
  const values = entry.categories || entry.category || 'Other'
  return (Array.isArray(values) ? values : [values]).filter((value) => typeof value === 'string')
}
const PAGE_SIZE = 12

export default function PolicyCheckPicker({ entries, selected, onChange, disabled = false, readOnly = false }) {
  const id = useId()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const selectedSet = new Set(selected)
  const categories = [...new Set(entries.flatMap(categoriesOf))].sort()
  const query = search.trim().toLocaleLowerCase()
  const filtered = entries.filter((entry) =>
    (!category || categoriesOf(entry).includes(category)) &&
    (filter !== 'selected' || selectedSet.has(policyEntryId(entry))) &&
    `${policyEntryName(entry)} ${policyEntryId(entry)} ${entry.description || ''} ${categoriesOf(entry).join(' ')}`.toLocaleLowerCase().includes(query))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const filteredIds = filtered.map(policyEntryId)
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((value) => selectedSet.has(value))

  function resetFilters() { setSearch(''); setCategory(''); setFilter('all'); setPage(1) }

  return <fieldset className="check-picker" disabled={disabled}>
    <legend className="policy-sr-only">{readOnly ? 'Browse available checks' : 'Select policy checks'}</legend>
    <div className="check-picker-filters">
      <label className="check-search">Search checks
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input type="search" placeholder="Search by name, description or ID" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
        </span>
      </label>
      <label>Category<select aria-label="Category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1) }}>
        <option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}
      </select></label>
    </div>
    <div className="check-picker-toolbar">
      {!readOnly ? <>
        <div className="check-filter-tabs" role="group" aria-label="Show checks">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setPage(1) }}>All checks <span>{entries.length}</span></button>
          <button type="button" aria-pressed={filter === 'selected'} onClick={() => { setFilter('selected'); setPage(1) }}>Selected <span>{selected.length}</span></button>
        </div>
        <div className="check-bulk-actions">
          <button type="button" className="policy-text-button" disabled={!filtered.length || allFilteredSelected}
            onClick={() => onChange([...new Set([...selected, ...filteredIds])])}>Select results ({filtered.length})</button>
          <button type="button" className="policy-text-button" disabled={!selected.length} onClick={() => onChange([])}>Clear selection</button>
        </div>
      </> : <span>{filtered.length} available checks</span>}
    </div>
    <div className="check-picker-list">
      {visible.map((entry) => {
        const entryId = policyEntryId(entry)
        const checked = selectedSet.has(entryId)
        return <div className={`check-picker-row ${!readOnly && checked ? 'is-selected' : ''}`} key={entryId}>
          {!readOnly && <input id={`${id}-${entryId}`} type="checkbox" checked={checked}
            aria-label={`Select ${policyEntryName(entry)}`}
            onChange={(event) => onChange(event.target.checked ? [...selected, entryId] : selected.filter((value) => value !== entryId))} />}
          <div className="check-picker-copy">
            {readOnly ? <strong>{policyEntryName(entry)}</strong> : <label htmlFor={`${id}-${entryId}`}>{policyEntryName(entry)}</label>}
            {entry.description && <p>{entry.description}</p>}
            <div className="check-picker-meta"><span>{categoriesOf(entry).join(' · ')}</span><code>{entryId}</code></div>
          </div>
          {!readOnly && checked && <span className="check-selected-mark" aria-hidden="true">✓</span>}
        </div>
      })}
      {!visible.length && <div className="policy-empty"><strong>{filter === 'selected' && !selected.length ? 'Your selection starts here' : 'No matching checks'}</strong>
        <p>{filter === 'selected' && !selected.length ? 'Open All checks to choose the ones this group needs.' : 'Try another search or category. Your selections are kept.'}</p>
        <button className="btn" type="button" onClick={resetFilters}>Show all checks</button>
      </div>}
    </div>
    <div className="policy-pagination check-pagination">
      <span aria-live="polite">{filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)}` : '0'} of {filtered.length} checks</span>
      <div><button type="button" className="btn" aria-label="Previous checks page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>{currentPage} / {pages}</span><button type="button" className="btn" aria-label="Next checks page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div>
    </div>
  </fieldset>
}
