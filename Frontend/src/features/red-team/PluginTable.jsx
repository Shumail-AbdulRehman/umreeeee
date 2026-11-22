import { useId } from 'react'
import { formatNumber, formatPercent } from '../../lib/format.js'
import { levelLabel, notScored, severityLabel } from './labels.js'
import './red-team.css'

const width = (rate) => `${Math.round(Math.min(1, Math.max(0, Number(rate) || 0)) * 100)}%`
const isNum = (value) => typeof value === 'number' && Number.isFinite(value)

function Badge({ info }) {
  return <span className={`rt-badge rt-badge-sm rt-tone-${info.tone}`}>{info.label}</span>
}

// `paired` is the report's `paired` object ({ plugin_rates }), a plain
// { plugin_id: rate } map, or null. A plugin without a paired rate reads "Not scored".
export default function PluginTable({ plugins = [], paired = null }) {
  const titleId = useId()
  const rates = paired?.plugin_rates ?? paired ?? {}
  const pairedLabel = paired?.mode === 'raw' ? 'Raw model' : 'With policies'
  const pairedRate = (id) => {
    const value = rates && typeof rates === 'object' ? rates[id] : undefined
    return isNum(value) ? value : null
  }
  return (
    <section className="rt-panel">
      <div className="rt-panel-head">
        <h2 className="rt-panel-title" id={titleId}>What broke, by plugin</h2>
        <span className="rt-panel-note">Sorted by risk</span>
      </div>
      {plugins.length === 0 ? (
        <p className="rt-empty">No plugin results in this report.</p>
      ) : (
        <div className="rt-table-region" role="region" tabIndex={0} aria-labelledby={titleId}>
          <table className="rt-table">
            <thead>
              <tr>
                <th scope="col">Plugin</th>
                <th scope="col">Risk</th>
                <th scope="col">Attacks that worked</th>
                <th scope="col" className="rt-num">{pairedLabel}</th>
                <th scope="col">Worst strategy</th>
              </tr>
            </thead>
            <tbody>
              {plugins.map((plugin) => {
                const severity = severityLabel(plugin.severity)
                const level = levelLabel(plugin.level)
                const policyRate = pairedRate(plugin.id)
                const score = isNum(plugin.risk_score) ? plugin.risk_score.toFixed(1) : '—'
                return (
                  <tr key={plugin.id}>
                    <td data-label="Plugin">
                      <strong>{plugin.name}</strong>
                      <small><Badge info={severity} /></small>
                    </td>
                    <td data-label="Risk">
                      <span className="rt-num"><strong style={{ display: 'inline' }}>{score}</strong></span>{' '}
                      <Badge info={level} />
                    </td>
                    <td data-label="Attacks that worked">
                      <span className="rt-bar rt-bar-risk" aria-hidden="true"><span style={{ width: width(plugin.rate) }} /></span>{' '}
                      <span className="rt-num">{formatPercent(plugin.rate)}</span>{' '}
                      <small style={{ display: 'inline' }}>{formatNumber(plugin.worked)} of {formatNumber(plugin.decided)}</small>
                    </td>
                    <td data-label={pairedLabel} className="rt-num">
                      {policyRate == null ? <span className="rt-muted">{notScored}</span> : formatPercent(policyRate)}
                    </td>
                    <td data-label="Worst strategy">
                      {plugin.worst_strategy && plugin.worked > 0
                        ? (plugin.worst_strategy_name || plugin.worst_strategy)
                        : <span className="rt-muted">No attack worked</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
