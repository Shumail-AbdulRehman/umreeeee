import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, ListFilter } from 'lucide-react'
import { Button } from './ui/button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from './ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { EmptyState } from './Surface'

export default function DataTable({ columns, rows, rowKey = 'id', title, description, emptyTitle, emptyDescription, toolbar, compact = false }) {
  const [sort, setSort] = useState(null)
  const [hidden, setHidden] = useState([])
  const visibleColumns = columns.filter((column) => !hidden.includes(column.id))
  const ordered = sort ? [...rows].sort((a, b) => {
    const column = columns.find((item) => item.id === sort.id)
    const left = column.value(a) ?? '', right = column.value(b) ?? ''
    const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true })
    return sort.direction === 'asc' ? comparison : -comparison
  }) : rows
  return <section className={`data-table-surface ${compact ? 'is-compact' : ''}`}>
    <div className="data-table-heading"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Columns3 size={14} />Columns</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Visible columns</DropdownMenuLabel><DropdownMenuSeparator />{columns.map((column) => <DropdownMenuCheckboxItem key={column.id} checked={!hidden.includes(column.id)} disabled={column.required || (!hidden.includes(column.id) && visibleColumns.length === 1)} onCheckedChange={(checked) => setHidden((current) => checked ? current.filter((id) => id !== column.id) : [...current, column.id])}>{column.label}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu></div>
    {toolbar && <div className="data-table-toolbar">{toolbar}</div>}
    {rows.length ? <><div className="table-scroll-hint"><ListFilter size={13} />Scroll to see all columns. Sorting applies to this loaded page.</div><Table className="premium-table"><TableHeader><TableRow>{visibleColumns.map((column) => <TableHead key={column.id} aria-sort={sort?.id === column.id ? sort.direction === 'asc' ? 'ascending' : 'descending' : undefined}>{column.value ? <button className="table-sort" onClick={() => setSort((current) => current?.id === column.id ? current.direction === 'asc' ? { id: column.id, direction: 'desc' } : null : { id: column.id, direction: 'asc' })}>{column.label}{sort?.id === column.id ? sort.direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} />}</button> : column.label}</TableHead>)}</TableRow></TableHeader><TableBody>{ordered.map((row, index) => <TableRow key={typeof rowKey === 'function' ? rowKey(row) : row[rowKey] || index}>{visibleColumns.map((column) => <TableCell key={column.id} className={column.className}>{column.render ? column.render(row) : column.value?.(row)}</TableCell>)}</TableRow>)}</TableBody></Table></> : <EmptyState title={emptyTitle} description={emptyDescription} />}
  </section>
}
