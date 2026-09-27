import { useState } from 'react'

const PAGE_SIZE = 8
const MAX_GROUPS = 500

export default function PolicyGroupPicker({ groups, selected, onChange, disabled, filterGroupId = '' }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const selectedSet = new Set(selected)
  const scoped = groups.filter((group) => !filterGroupId || group._id === filterGroupId)
  const query = search.trim().toLocaleLowerCase()
  const filtered = scoped.filter((group) =>
    `${group.name} ${group.description || ''}`.toLocaleLowerCase().includes(query) &&
    (filter === 'all' || (filter === 'selected' ? selectedSet.has(group._id) : !selectedSet.has(group._id))))
    .sort((a, b) => a.name.localeCompare(b.name) || a._id.localeCompare(b._id))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const results = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const merged = [...new Set([...selected, ...filtered.map((group) => group._id)])]
  const filteredIds = new Set(filtered.map((group) => group._id))
  const selectedInFilter = filtered.filter((group) => selectedSet.has(group._id)).length
  const unavailable = selected.filter((id) => !groups.some((group) => group._id === id))

  return <fieldset className="policy-group-picker" disabled={disabled}>
    <legend>{filterGroupId ? 'Group assignment' : 'User groups'} {!filterGroupId && <span className="policy-group-total">{selected.length} selected</span>}</legend>
    {!filterGroupId && <><label className="policy-group-search">Search groups<input type="search" value={search} placeholder="Name or description…"
      onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label>
    <div className="policy-group-filters" role="group" aria-label="Filter user groups">
      {[['all', 'All'], ['selected', 'Selected'], ['unselected', 'Not selected']].map(([value, label]) =>
        <button type="button" aria-pressed={filter === value} key={value} onClick={() => { setFilter(value); setPage(1) }}>{label}</button>)}
    </div>
    <div className="policy-group-bulk">
      <button type="button" className="btn" disabled={!filtered.length || merged.length > MAX_GROUPS || selectedInFilter === filtered.length}
        onClick={() => onChange(merged)}>Select results ({filtered.length})</button>
      <button type="button" className="btn" disabled={!selectedInFilter}
        onClick={() => onChange(selected.filter((id) => !filteredIds.has(id)))}>Clear results</button>
    </div>
    </>}
    {filterGroupId && <p className="policy-editor-intro">Check to assign this policy; uncheck to remove it. Other group assignments stay the same.</p>}
    {merged.length > MAX_GROUPS && <p className="policy-hint">A policy supports up to 500 groups. Narrow your search to select results.</p>}
    <div className="policy-group-list">
      {results.map((group) => <label className={`policy-group-row ${selectedSet.has(group._id) ? 'is-selected' : ''}`} key={group._id}>
        <input type="checkbox" checked={selectedSet.has(group._id)} aria-label={`Assign to ${group.name}`}
          disabled={!selectedSet.has(group._id) && selected.length >= MAX_GROUPS}
          onChange={(event) => onChange(event.target.checked ? [...selected, group._id] : selected.filter((id) => id !== group._id))} />
        <span className="policy-group-copy"><strong>{group.name}</strong>
          {group.description && <span className="policy-group-description" title={group.description}>{group.description}</span>}
          <small>{group.member_count ?? 0} {(group.member_count ?? 0) === 1 ? 'member' : 'members'}</small></span>
        {selectedSet.has(group._id) && <span className="policy-group-check" aria-hidden="true">✓</span>}
      </label>)}
      {!results.length && <div className="policy-group-empty"><strong>{groups.length ? 'No matching groups' : 'No active groups yet'}</strong>
        <p>{groups.length ? 'Try a different search or filter.' : 'Create a group in Groups, then return to assign this policy.'}</p>
        {groups.length > 0 && <button type="button" className="btn" onClick={() => { setSearch(''); setFilter('all'); setPage(1) }}>Reset filters</button>}</div>}
    </div>
    {!filterGroupId && <div className="policy-group-pagination"><span aria-live="polite">{filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)}` : '0'} of {filtered.length} groups</span>
      <div><button type="button" className="btn" aria-label="Previous group page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>
        <button type="button" className="btn" aria-label="Next group page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>›</button></div></div>}
    {unavailable.length > 0 && <div className="admin-notice"><p>{unavailable.length} saved group assignment(s) are no longer available. Remove them before saving.</p>
      <button type="button" className="btn" onClick={() => onChange(selected.filter((id) => !unavailable.includes(id)))}>Remove unavailable groups</button></div>}
  </fieldset>
}
