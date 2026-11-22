import { formatDate, formatNumber, formatPercent } from '../../lib/format.js'
import { levelLabel } from './labels.js'
import './red-team.css'

const isNum = (value) => typeof value === 'number' && Number.isFinite(value)
const scaleWidth = (score) => `${Math.round(Math.min(10, Math.max(0, Number(score) || 0)) * 10)}%`
const score1 = (score) => (isNum(score) ? score.toFixed(1) : '—')

function Score({ label, score, level }) {
  const info = levelLabel(level)
  return (
    <div>
      <span className="rt-muted">{label}</span>
      <div className="rt-kpi-value">
        <strong>{score1(score)}</strong>
        <span className="rt-kpi-of">/ 10</span>
        <span className={`rt-badge rt-tone-${info.tone}`}>{info.label}</span>
      </div>
      <div className="rt-scale" aria-hidden="true"><span style={{ width: scaleWidth(score) }} /></div>
    </div>
  )
}

function trendSentence(report, mode) {
  const trend = report.trend
  const score = report.risk?.score
  if (!trend || !isNum(trend.risk_score) || !isNum(score)) return null
  const diff = Math.round((score - trend.risk_score) * 10) / 10
  const label = `${mode === 'protected' ? 'Protected' : 'Raw'} risk`
  const when = trend.finished_at ? `the ${formatDate(trend.finished_at).split(',')[0]} run` : 'the previous run'
  if (diff === 0) return `${label} is unchanged from ${when} of this test.`
  return `${label} is ${Math.abs(diff).toFixed(1)} ${diff < 0 ? 'lower' : 'higher'} than ${when} of this test.`
}

// Props: report (v3 payload), mode ('raw' | 'protected'; defaults to report.mode).
export default function ReportSummary({ report, mode }) {
  if (!report) return null
  const runMode = mode ?? report.mode ?? 'raw'
  const protectedRun = runMode === 'protected'
  const paired = report.paired ?? null
  const risk = report.risk ?? {}
  const asr = report.attack_success ?? {}
  const decided = report.decided ?? {}
  const threshold = report.threshold ?? {}
  const thisLabel = protectedRun ? 'With policies' : 'Raw model'
  const pairedLabel = protectedRun ? 'Raw model' : 'With policies'
  const cloneTarget = protectedRun ? 'raw' : 'protected'

  const rawScore = protectedRun ? paired?.risk?.score : risk.score
  const protScore = protectedRun ? risk.score : paired?.risk?.score
  const reduction = paired && isNum(rawScore) && isNum(protScore) ? Math.round((rawScore - protScore) * 10) / 10 : null
  const trend = trendSentence(report, runMode)

  const thresholdPct = isNum(threshold.threshold) ? `${Math.round(threshold.threshold * 100)}%` : null
  const verdict = threshold.verdict
  let thresholdLine = null
  if (verdict === 'below_threshold') thresholdLine = `Defended ${formatPercent(threshold.defended_rate)}, below the ${thresholdPct} threshold`
  else if (verdict === 'meets_threshold') thresholdLine = `Defended ${formatPercent(threshold.defended_rate)}, meets the ${thresholdPct} threshold`
  else if (verdict === 'insufficient_evidence') thresholdLine = 'Not enough decided attacks to compare with the threshold'

  const exactCount = (decided.exact ?? 0) + (decided.policy ?? 0)

  return (
    <section className="rt-kpi-grid" aria-label="Report summary"
      style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      <article className="rt-panel rt-panel-body" aria-labelledby="rt-sum-risk">
        <h2 className="rt-panel-title" id="rt-sum-risk">Overall risk</h2>
        <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
          <Score label={thisLabel} score={risk.score} level={risk.level} />
          {paired ? (
            <Score label={pairedLabel} score={paired.risk?.score} level={paired.risk?.level} />
          ) : (
            <p className="rt-muted">Clone as {cloneTarget} to compare.</p>
          )}
        </div>
        {paired && (
          <p style={{ marginTop: 12 }}>
            {reduction == null
              ? 'The paired run has no score to compare.'
              : reduction >= 0
                ? `Same attacks and seed. Policies lowered risk by ${reduction.toFixed(1)} points.`
                : `Same attacks and seed. Policies raised risk by ${Math.abs(reduction).toFixed(1)} points.`}
          </p>
        )}
        {trend && <p className="rt-muted" style={{ marginTop: 6 }}>{trend}</p>}
      </article>

      <article className="rt-panel rt-panel-body" aria-labelledby="rt-sum-asr">
        <h2 className="rt-panel-title" id="rt-sum-asr">Attacks that worked</h2>
        <div className="rt-kpi-value" style={{ marginTop: 12 }}>
          <strong>{formatPercent(asr.rate)}</strong>
          <span className="rt-kpi-of">{protectedRun ? 'with policies' : 'raw'}</span>
          {paired && isNum(paired.attack_success?.rate) && (
            <span className="rt-kpi-of">{formatPercent(paired.attack_success.rate)} {protectedRun ? 'raw' : 'with policies'}</span>
          )}
        </div>
        <p style={{ marginTop: 8 }}>
          {formatNumber(asr.worked)} of {formatNumber(asr.decided)} decided: {formatNumber(asr.proven)} proven by exact evidence, {formatNumber(asr.judged)} judged.
        </p>
        {thresholdLine && (
          <p className={verdict === 'below_threshold' ? 'rt-tone-warn' : 'rt-muted'}
            style={{ marginTop: 8, ...(verdict === 'below_threshold' ? { padding: '6px 10px', borderRadius: 6, border: '1px solid' } : {}) }}>
            {thresholdLine}
          </p>
        )}
      </article>

      <article className="rt-panel rt-panel-body" aria-labelledby="rt-sum-decided">
        <h2 className="rt-panel-title" id="rt-sum-decided">Decided</h2>
        <div className="rt-kpi-value" style={{ marginTop: 12 }}>
          <strong>{formatNumber(decided.decided)}</strong>
          <span className="rt-kpi-of">of {formatNumber(decided.adversarial)} attacks</span>
        </div>
        <p className="rt-muted" style={{ marginTop: 8 }}>
          {formatNumber(exactCount)} by exact evidence, {formatNumber(decided.judge)} by the judge. {formatNumber(decided.inconclusive)} inconclusive and {formatNumber(decided.errors)} errors are left out of the score.
        </p>
      </article>
    </section>
  )
}

