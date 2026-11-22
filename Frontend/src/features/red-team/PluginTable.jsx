import { useId } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx'
import { formatNumber, formatPercent } from '../../lib/format.js'
import { levelLabel, notScored, severityLabel } from './labels.js'
import './red-team.css'

function Badge({ info }) {
  return <span className={`rt-badge rt-badge-sm rt-tone-${info.tone}`}>{info.label}</span>
}

export function ReportTable({ titleId, headings, compact = false, children }) {
  return (
    <div className="rt-table-region transition-none! [&>[data-slot=table-container]]:contents"
      role="region" tabIndex={0} aria-labelledby={titleId}>
      <Table
        className="rt-table [&_td]:whitespace-normal [&_td]:[overflow-wrap:anywhere] [&_tr]:border-b-0! [&_tr]:transition-none!"
        style={compact ? { minWidth: 0 } : undefined}
        role="table" aria-labelledby={titleId}>
        <TableHeader role="rowgroup">
          <TableRow role="row">
            {headings.map((heading) => <TableHead key={heading} role="columnheader" scope="col">{heading}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody role="rowgroup">{children}</TableBody>
      </Table>
    </div>
  )
}

export function ReportOutcome({ outcome }) {
  const { decided, total, worked, defended, errors, pending, rate } = outcome
  const counts = [
    [worked, 'worked'],
    [defended, 'defended'],
    [errors, errors === 1 ? 'error' : 'errors'],
    [pending, 'pending'],
  ].filter(([count]) => Number.isFinite(count)).map(([count, label]) => `${formatNumber(count)} ${label}`)
  return (
    <>
      <strong className="rt-num">{rate == null || decided === 0 ? notScored : `${formatPercent(rate)} worked`}</strong>
      {Number.isFinite(decided) && (
        <small>{total == null ? formatNumber(decided) : `${formatNumber(decided)} of ${formatNumber(total)}`} decided</small>
      )}
      {counts.length > 0 && <small>{counts.join(' · ')}</small>}
    </>
  )
}

export default function PluginTable({ plugins = [], paired = null }) {
  const titleId = useId()
  const pairedLabel = paired?.mode === 'raw' ? 'Raw model' : 'With policies'
  const pairedRates = paired?.plugin_rates
  const headings = ['Plugin', 'Risk', 'Attack outcomes', ...(pairedRates ? [pairedLabel] : []), 'Worst strategy']

  return (
    <section className="rt-panel">
      <div className="rt-panel-head">
        <h2 className="rt-panel-title" id={titleId}>What broke, by plugin</h2>
      </div>
      {!plugins?.length ? (
        <p className="rt-empty">No plugin results in this report.</p>
      ) : (
        <ReportTable titleId={titleId} headings={headings}>
          {plugins.map((plugin) => {
            const severity = severityLabel(plugin.severity)
            const level = levelLabel(plugin.level)
            const score = plugin.level === 'none' ? 0 : plugin.risk_score
            const pairedRate = pairedRates?.[plugin.id]
            return (
              <TableRow key={plugin.id} role="row">
                <TableCell role="rowheader" data-label="Plugin">
                  <strong>{plugin.name || plugin.id}</strong>
                  {!severity.missing && <small><Badge info={severity} /></small>}
                </TableCell>
                <TableCell role="cell" data-label="Risk">
                  {Number.isFinite(score) ? (
                    <>
                      <strong className="rt-num">{score.toFixed(1)}</strong>
                      {!level.missing && <Badge info={level} />}
                    </>
                  ) : notScored}
                </TableCell>
                <TableCell role="cell" data-label="Attack outcomes"><ReportOutcome outcome={plugin} /></TableCell>
                {pairedRates && (
                  <TableCell role="cell" data-label={pairedLabel} className="rt-num">
                    {Number.isFinite(pairedRate) ? formatPercent(pairedRate) : notScored}
                  </TableCell>
                )}
                <TableCell role="cell" data-label="Worst strategy">
                  {plugin.worst_strategy_name || plugin.worst_strategy || (
                    <span className="rt-muted">{plugin.decided > 0 && plugin.worked === 0 ? 'No attack worked' : notScored}</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </ReportTable>
      )}
    </section>
  )
}
