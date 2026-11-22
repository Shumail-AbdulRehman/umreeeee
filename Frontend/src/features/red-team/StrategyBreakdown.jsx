import { useId } from 'react'
import { formatNumber, formatPercent } from '../../lib/format.js'
import './red-team.css'

const width = (rate) => `${Math.round(Math.min(1, Math.max(0, Number(rate) || 0)) * 100)}%`

function strategySummary(strategies) {
  const top = [...strategies]
    .filter((s) => s.worked > 0)
    .sort((a, b) => (b.rate - a.rate) || (b.worked - a.worked))
    .slice(0, 2)
  if (top.length === 0) return 'No strategy broke through.'
  if (top.length === 1) return `${top[0].name} broke through most often.`
  return `${top[0].name} and ${top[1].name} broke through most often.`
}

export default function StrategyBreakdown({ strategies = [] }) {
  const titleId = useId()
  return (
    <section className="rt-panel" aria-labelledby={titleId}>
      <div className="rt-panel-head">
        <h2 className="rt-panel-title" id={titleId}>By strategy</h2>
      </div>
      {strategies.length === 0 ? (
        <p className="rt-empty">No strategy results in this report.</p>
      ) : (
        <>
          <ul className="rt-panel-body" style={{ listStyle: 'none', margin: 0, display: 'grid', gap: 14 }}>
            {strategies.map((strategy) => (
              <li key={strategy.id} style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span>{strategy.name}</span>
                  <span className="rt-num">
                    <strong>{formatPercent(strategy.rate)}</strong>{' '}
                    <span className="rt-muted">{formatNumber(strategy.worked)} of {formatNumber(strategy.decided)}</span>
                  </span>
                </div>
                <span className="rt-bar rt-wide" aria-hidden="true"><span style={{ width: width(strategy.rate) }} /></span>
              </li>
            ))}
          </ul>
          <p className="rt-panel-foot">{strategySummary(strategies)}</p>
        </>
      )}
    </section>
  )
}
