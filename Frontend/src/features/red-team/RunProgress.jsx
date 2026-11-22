import { useState } from 'react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatNumber, formatPercent } from '../../lib/format.js'
import { notScored, statusLabel, verdictLabel } from './labels.js'
import './red-team.css'

const num = (value) => Number(value) || 0

function Badge({ info }) {
  return (
    <span className={`rt-badge rt-badge-sm rt-tone-${info.tone}${info.judged ? ' rt-judged' : ''}`}>
      {info.missing ? <><span aria-hidden="true">–</span><span className="rt-sr-only">{notScored}</span></> : info.label}
    </span>
  )
}

function remainingMinutes(progress, requestsPerMinute) {
  const left = num(progress?.queued) + num(progress?.running) + num(progress?.retry_wait)
  const pace = Number(requestsPerMinute)
  if (!left || !(pace > 0)) return null
  return Math.ceil(left / pace)
}

export default function RunProgress({
  test,
  provisional,
  latest = [],
  requestsPerMinute,
  updatedAgo,
  dispatchPending = false,
  busy = false,
  onCancel,
}) {
  const [open, setOpen] = useState(false)
  const progress = test?.progress || {}
  const total = num(progress.total_jobs)
  const finished = num(progress.finished ?? progress.terminal_jobs)
  const queued = num(progress.queued)
  const running = num(progress.running)
  const retry = num(progress.retry_wait)
  const fraction = total > 0 ? Math.min(1, finished / total) : 0
  const minutes = remainingMinutes(progress, requestsPerMinute)
  const status = statusLabel(test?.status, Math.round(fraction * 100))
  const decided = num(provisional?.decided)
  const worked = num(provisional?.worked)
  const pace = Number(requestsPerMinute)

  const confirm = () => {
    setOpen(false)
    onCancel?.()
  }

  return (
    <div className="rt-run">
      <div className="rt-panel-head">
        <Badge info={status} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button type="button" className="rt-chip rt-press" disabled={busy}>Cancel test</button>
          </DialogTrigger>
          <DialogContent className="rt-dialog" showCloseButton={false}>
            <div className="rt-panel-body">
              <DialogTitle>Cancel this test?</DialogTitle>
              <DialogDescription className="rt-sr-only">Choose whether to stop the remaining attacks.</DialogDescription>
              <ul className="rt-banner rt-tone-fail">
                <li>The {formatNumber(queued)} queued attacks will not run.</li>
                <li>The attack in progress may still finish, and may cost money.</li>
                <li>The {formatNumber(finished)} finished results stay in the report, marked as a cancelled run with no final score.</li>
              </ul>
            </div>
            <DialogFooter className="rt-panel-foot">
              <DialogClose asChild><button type="button" className="rt-chip rt-press">Keep running</button></DialogClose>
              <button type="button" className="rt-chip rt-press rt-tone-fail" onClick={confirm} disabled={busy}>Cancel test</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <section className="rt-panel" aria-labelledby="rt-run-title">
        <div className="rt-panel-head">
          <h2 id="rt-run-title" className="rt-panel-title">Running</h2>
          <strong className="rt-num">{formatNumber(finished)} of {formatNumber(total)} finished</strong>
        </div>
        <div className="rt-panel-body">
          <div className="rt-progress" role="progressbar" aria-label="Finished attacks" aria-valuemin={0} aria-valuemax={total} aria-valuenow={finished}>
            <span style={{ '--rt-progress': fraction }} />
          </div>
          <dl className="rt-run-counts">
            <div><dt>Finished</dt><dd className="rt-num">{formatNumber(finished)}</dd></div>
            <div><dt>Running</dt><dd className="rt-num">{formatNumber(running)}</dd></div>
            <div><dt>Queued</dt><dd className="rt-num">{formatNumber(queued)}</dd></div>
            <div><dt>Waiting to retry</dt><dd className="rt-num">{formatNumber(retry)}</dd></div>
          </dl>
          <p className="rt-panel-note">
            {pace > 0 ? `One attack runs at a time, up to ${pace} per minute` : 'Attacks run one at a time'}
            {minutes != null ? `, so about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} remain` : ''}
            . You can leave this page; the test keeps running.{' '}
            <span aria-live="polite">{updatedAgo != null ? `Updated ${updatedAgo} s ago.` : ''}</span>
          </p>
          {dispatchPending && <p className="rt-banner rt-tone-accent">Waiting for the queue to pick this test up. That is not a result.</p>}
        </div>
      </section>

      <section aria-label="Provisional figures" className="rt-run-kpis">
        <article className="rt-panel rt-panel-body">
          <h2 className="rt-panel-title">Attacks that worked so far</h2>
          <div className="rt-kpi-value"><strong>{decided > 0 ? formatPercent(provisional?.attack_success_rate) : '–'}</strong><span className="rt-badge rt-badge-sm rt-tone-neutral">Provisional</span></div>
          <p className="rt-panel-note">{formatNumber(worked)} of {formatNumber(decided)} decided.</p>
        </article>
        <article className="rt-panel rt-panel-body">
          <h2 className="rt-panel-title">Decided so far</h2>
          <div className="rt-kpi-value"><strong>{formatNumber(decided)}</strong><span className="rt-kpi-of">of {formatNumber(num(provisional?.finished ?? finished))} finished</span></div>
          <p className="rt-panel-note">The rest are waiting for the judge or inconclusive.</p>
        </article>
        <article className="rt-panel rt-panel-body">
          <h2 className="rt-panel-title">Overall risk</h2>
          <div className="rt-kpi-value"><strong className="rt-muted">Not yet</strong></div>
          <p className="rt-panel-note">Calculated when the test finishes, so a partial run never shows a final score.</p>
        </article>
      </section>

      <section className="rt-panel" aria-labelledby="rt-latest-title">
        <div className="rt-panel-head"><h2 id="rt-latest-title" className="rt-panel-title">Latest results</h2></div>
        <div className="rt-table-region" role="region" tabIndex={0} aria-labelledby="rt-latest-title">
          <table className="rt-table">
            <thead><tr><th className="rt-num">#</th><th>Plugin</th><th>Verdict</th><th>Strategy</th><th>Evidence</th></tr></thead>
            <tbody>
              {latest.map((row) => (
                <tr key={row.id}>
                  <td data-label="#" className="rt-num">{row.attack_index}</td>
                  <td data-label="Plugin"><strong>{row.plugin_name}</strong></td>
                  <td data-label="Verdict"><Badge info={verdictLabel(row.verdict, { verdict_source: row.verdict_source })} /></td>
                  <td data-label="Strategy">{row.strategy_name}</td>
                  <td data-label="Evidence">{row.evidence || (row.state === 'judging' || row.verdict === 'pending' ? 'Waiting for the judge' : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
