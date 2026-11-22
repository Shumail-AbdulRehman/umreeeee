import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatNumber, formatPercent } from '../../lib/format.js'
import { evidenceSourceLabel, phaseLabel, statusLabel, verdictLabel } from './labels.js'
import './red-team.css'

const ACTIVE_STATUSES = new Set(['queued', 'generating', 'running', 'cancelling'])
const PHASE_BY_STATUS = { generating: 'generating', running: 'evaluating' }
const isCount = (value) => Number.isInteger(value) && value >= 0

function CancelRun({ busy, onCancel }) {
  const [open, setOpen] = useState(false)
  const confirmed = useRef(false)

  const changeOpen = (nextOpen) => {
    if (nextOpen) {
      if (busy) return
      confirmed.current = false
    }
    setOpen(nextOpen)
  }

  const confirm = () => {
    if (busy || confirmed.current) return
    confirmed.current = true
    setOpen(false)
    onCancel()
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-0 aria-disabled:opacity-50" aria-disabled={busy}>Cancel test</Button>
      </DialogTrigger>
      <DialogContent className="rt-dialog overflow-y-auto motion-reduce:animate-none" showCloseButton={false}>
        <div className="rt-panel-body grid gap-2">
          <DialogTitle>Cancel this test?</DialogTitle>
          <DialogDescription>Completed results are kept. Cancellation may take time while work is in progress.</DialogDescription>
        </div>
        <DialogFooter className="rt-panel-foot">
          <DialogClose asChild><Button type="button" variant="outline" className="min-h-11 sm:min-h-0">Keep running</Button></DialogClose>
          <Button type="button" variant="destructive" className="min-h-11 sm:min-h-0" onClick={confirm} disabled={busy}>Cancel test</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LatestResults({ rows }) {
  return (
    <section className="rt-panel">
      <div className="rt-panel-head"><h2 id="rt-latest-title" className="rt-panel-title">Latest results</h2></div>
      {rows.length === 0 ? <p className="rt-empty">No results recorded yet.</p> : (
        <div className="rt-table-region" role="region" tabIndex={0} aria-labelledby="rt-latest-title">
          <table className="rt-table">
            <thead><tr><th scope="col" className="rt-num">#</th><th scope="col">Plugin</th><th scope="col">Verdict</th><th scope="col">Strategy</th><th scope="col">Evidence</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const verdict = verdictLabel(row.verdict, row)
                const source = row.verdict_source && evidenceSourceLabel(row.verdict_source).label
                const index = row.attack_index ?? (isCount(row.test_idx) ? row.test_idx + 1 : '—')
                return (
                  <tr key={row.id}>
                    <td data-label="#" className="rt-num">{index}</td>
                    <td data-label="Plugin"><strong>{row.plugin_name || row.plugin_id || '—'}</strong></td>
                    <td data-label="Verdict"><span className={`rt-badge rt-tone-${verdict.tone}`}>{verdict.label}</span></td>
                    <td data-label="Strategy">{row.strategy_name || row.strategy_id || '—'}</td>
                    <td data-label="Evidence">
                      {source && <><strong>{source}</strong>{' '}</>}
                      {row.grader_reason || row.evidence || (row.verdict === 'pending' || row.verdict === 'judging' ? 'Awaiting grade' : !source && '—')}
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

export default function RunProgress({
  test,
  provisional,
  latest = [],
  elapsedSeconds,
  updatedAgo,
  dispatchPending = false,
  busy = false,
  onCancel,
}) {
  const status = test?.status
  const active = ACTIVE_STATUSES.has(status)
  const phase = active && status !== 'cancelling' ? test?.progress?.phase ?? PHASE_BY_STATUS[status] : null
  const label = phase ? phaseLabel(phase).label : statusLabel(status).label
  const evaluating = phase === 'evaluating'
  const importing = phase === 'importing'
  const counts = test?.counts ?? test?.progress
  const planned = isCount(counts?.planned) && counts.planned > 0 ? counts.planned : undefined
  const executed = isCount(counts?.executed) ? Math.min(counts.executed, planned ?? counts.executed) : undefined
  const graded = isCount(counts?.graded) ? Math.min(counts.graded, executed ?? planned ?? counts.graded) : undefined
  const determinate = (evaluating || importing) && planned !== undefined && executed !== undefined
  const progressText = determinate ? `${formatNumber(executed)}/${formatNumber(planned)}` : undefined
  const decided = isCount(provisional?.decided) ? provisional.decided : undefined
  const worked = isCount(provisional?.worked) ? provisional.worked : undefined
  const rate = provisional?.attack_success_rate
  const successKnown = decided > 0 && Number.isFinite(rate) && rate >= 0 && rate <= 1

  return (
    <div className="grid gap-4">
      <section className="rt-panel" aria-labelledby="rt-run-title">
        <div className="rt-panel-head">
          <h2 id="rt-run-title" className="rt-panel-title rt-num">
            {evaluating && progressText ? `${label} ${progressText}` : label}
          </h2>
          {active && onCancel && <CancelRun busy={busy || status === 'cancelling'} onCancel={onCancel} />}
        </div>
        <span role="status" aria-live="polite" className="rt-sr-only">{label}</span>
        {active && (
          <div className="rt-panel-body grid gap-3 pt-0">
            <div className="rt-progress" role="progressbar" aria-label="Executed attacks"
              aria-valuemin={determinate ? 0 : undefined} aria-valuemax={determinate ? planned : undefined}
              aria-valuenow={determinate ? executed : undefined}
              aria-valuetext={determinate ? `${formatNumber(executed)} of ${formatNumber(planned)} executed` : undefined}>
              {determinate && <div className="h-full rounded-full transition-[width] duration-250 ease-linear motion-reduce:transition-none"
                style={{ width: `${executed / planned * 100}%`, backgroundColor: 'var(--rt-accent)' }} />}
            </div>
            {(evaluating || importing) && (
              <dl className="flex flex-wrap gap-x-6 gap-y-2">
                <div><dt className="rt-panel-note">Executed</dt><dd className="rt-num">{formatNumber(executed)}</dd></div>
                <div><dt className="rt-panel-note">Planned</dt><dd className="rt-num">{planned === undefined ? 'Total pending' : formatNumber(planned)}</dd></div>
                <div><dt className="rt-panel-note">Graded</dt><dd className="rt-num">{formatNumber(graded)}</dd></div>
              </dl>
            )}
            {(isCount(elapsedSeconds) || isCount(updatedAgo)) && (
              <div className="rt-panel-note flex flex-wrap gap-x-4">
                {isCount(elapsedSeconds) && <span>Elapsed {formatNumber(elapsedSeconds)} s</span>}
                {isCount(updatedAgo) && <span>Updated {formatNumber(updatedAgo)} s ago</span>}
              </div>
            )}
            {status === 'queued' && dispatchPending && <p className="rt-panel-note">Waiting for the worker to pick up this test.</p>}
          </div>
        )}
      </section>

      {active && (
        <section aria-label="Provisional figures" className="rt-panel rt-panel-body">
          <h2 className="rt-panel-title">Attack success so far</h2>
          <div className="rt-kpi-value mt-1">
            <strong>{successKnown ? formatPercent(rate) : '—'}</strong>
            <span className="rt-badge rt-badge-sm rt-tone-neutral">Provisional</span>
          </div>
          <p className="rt-panel-note mt-1">
            {decided > 0 && worked !== undefined && worked <= decided
              ? `${formatNumber(worked)} of ${formatNumber(decided)} decided attacks succeeded.`
              : decided === 0 ? 'No attacks have been decided yet.' : 'Attack success is unavailable.'}
          </p>
        </section>
      )}

      <LatestResults rows={latest} />
    </div>
  )
}
