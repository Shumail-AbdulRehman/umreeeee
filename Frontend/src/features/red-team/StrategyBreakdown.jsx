import { useId } from 'react'
import { TableCell, TableRow } from '../../components/ui/table.jsx'
import { ReportOutcome, ReportTable } from './PluginTable.jsx'
import './red-team.css'

export default function StrategyBreakdown({ strategies = [] }) {
  const titleId = useId()
  return (
    <section className="rt-panel">
      <div className="rt-panel-head">
        <h2 className="rt-panel-title" id={titleId}>By strategy</h2>
      </div>
      {!strategies?.length ? (
        <p className="rt-empty">No strategy results in this report.</p>
      ) : (
        <ReportTable titleId={titleId} headings={['Strategy', 'Attack outcomes']} compact>
          {strategies.map((strategy) => (
            <TableRow key={strategy.id} role="row">
              <TableCell role="rowheader" data-label="Strategy"><strong>{strategy.name || strategy.id}</strong></TableCell>
              <TableCell role="cell" data-label="Attack outcomes"><ReportOutcome outcome={strategy} /></TableCell>
            </TableRow>
          ))}
        </ReportTable>
      )}
    </section>
  )
}
