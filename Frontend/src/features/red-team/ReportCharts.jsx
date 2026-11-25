import { useId } from 'react'
import { formatNumber } from '../../lib/format.js'

function CaseOutcomes({ decided, success, planned, threshold }) {
  const titleId = useId()
  const worked = decided?.unsafe ?? success?.worked
  const count = decided?.decided ?? success?.decided
  const defended = decided?.defended ?? (Number.isFinite(count) && Number.isFinite(worked) ? count - worked : null)
  const outcomes = [
    ['worked', 'Worked', worked],
    ['defended', 'Defended', defended],
    ['error', 'Errors', decided?.errors],
    ['pending', 'Pending', decided?.pending],
  ].filter(([, , value]) => Number.isFinite(value) && value >= 0)
  const total = outcomes.reduce((sum, [, , value]) => sum + value, 0)

  return (
    <section className="rt-panel rt-panel-body rt-report-chart" aria-labelledby={titleId}>
      <h2 className="rt-panel-title" id={titleId}>Case outcomes</h2>
      {total > 0 ? <>
        <p className="rt-panel-note">
          {total === planned ? `All ${formatNumber(total)} cases in this run` : `${formatNumber(total)} recorded ${total === 1 ? 'case' : 'cases'}`}
        </p>
        <div className="rt-outcome-plot" aria-hidden="true">
          <div className="rt-outcome-bar">
            {outcomes.filter(([, , value]) => value > 0).map(([kind, , value]) => (
              <span className={`rt-chart-color-${kind}`} key={kind} style={{ flexGrow: value }} />
            ))}
          </div>
          <div className="rt-chart-axis"><span>0</span><span>{formatNumber(total)} cases</span></div>
        </div>
        <ul className="rt-outcome-legend">
          {outcomes.map(([kind, label, value]) => (
            <li key={kind}>
              <span className={`rt-chart-color-${kind}`} aria-hidden="true" />
              <span>{value === 1 && kind === 'error' ? 'Error' : label}</span>
              <strong>{formatNumber(value)}</strong>
            </li>
          ))}
        </ul>
      </> : <p className="rt-panel-note">No case outcomes recorded.</p>}
      {threshold && <p className="rt-panel-note rt-report-threshold">{threshold}</p>}
    </section>
  )
}

function TopPluginRisks({ plugins }) {
  const titleId = useId()
  const hasRisk = plugins.some(({ risk_score }) => risk_score > 0)

  return (
    <section className="rt-panel rt-panel-body rt-report-chart" aria-labelledby={titleId}>
      <h2 className="rt-panel-title" id={titleId}>Top plugin risks</h2>
      {hasRisk ? <>
        <p className="rt-panel-note">Highest recorded scores on a scale of 0–10</p>
        <ul className="rt-risk-chart">
          {plugins.map(({ id, name, risk_score: score, level }) => (
            <li key={id}>
              <span>{name || id}</span>
              <span className="rt-risk-track" aria-hidden="true">
                <span className={level === 'critical' ? 'rt-risk-critical' : undefined} style={{ width: `${Math.min(score, 10) * 10}%` }} />
              </span>
              <strong>{score.toFixed(1)}</strong>
            </li>
          ))}
        </ul>
        <div className="rt-risk-axis" aria-hidden="true">
          <div className="rt-chart-axis"><span>0</span><span>5</span><span>10</span></div>
        </div>
      </> : <p className="rt-panel-note">
        {plugins.length ? 'No plugin recorded a positive risk score.' : 'No plugin risk scores are available.'}
      </p>}
    </section>
  )
}

export default function ReportCharts({ report, threshold }) {
  const rankedPlugins = report.provisional ? [] : (report.plugins ?? [])
    .filter(({ risk_score, decided }) => Number.isFinite(risk_score) && decided !== 0)
    .sort((left, right) => right.risk_score - left.risk_score)
    .slice(0, 4)

  return <div className={`rt-report-charts${rankedPlugins.length < 3 ? ' rt-report-charts-compact' : ''}`}>
    <CaseOutcomes decided={report.decided} success={report.attack_success}
      planned={report.engine?.generated_tests} threshold={threshold} />
    <TopPluginRisks plugins={rankedPlugins} />
  </div>
}
