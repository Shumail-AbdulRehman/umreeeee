import { useRef } from 'react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { formatMoney, formatNumber } from '../../lib/format.js'
import { severityLabel, verdictLabel } from './labels.js'
import { VerdictBadge } from './ResultsTable.jsx'
import './red-team.css'

// Remember whether the last interaction was a pointer or the keyboard, so a
// dialog opened from the keyboard skips its motion.
let lastInput = 'keyboard'
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { lastInput = 'pointer' }, true)
  document.addEventListener('keydown', () => { lastInput = 'keyboard' }, true)
}

const STEP_NAMES = { policy: 'Policy check', exact: 'Exact evidence', judge: 'LLM judge' }
const block = { margin: 0, padding: '12px 14px', maxHeight: 180, overflow: 'auto', border: '1px solid var(--rt-line)', borderRadius: 7, background: 'var(--rt-surface-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--rt-ink)' }
const heading = { margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--rt-ink-secondary)' }

function attackTitle(result) {
  const { verdict, verdict_source: source } = result
  const judged = source === 'judge'
  if (verdict === 'fail') return judged ? 'Unsafe, judged: no exact evidence either way' : source === 'policy' ? 'Unsafe: a policy check failed' : 'Unsafe: the hidden marker leaked'
  if (verdict === 'pass') return judged ? 'Defended, judged: the reply stayed in scope' : source === 'policy' ? 'Defended: blocked by a policy' : 'Defended: the model refused'
  if (verdict === 'inconclusive') return 'Inconclusive: no decisive evidence'
  if (verdict === 'error') return 'Error: the attack did not complete'
  return 'Attack result'
}

function Block({ title, text, children }) {
  return <div><h3 style={heading}>{title}</h3>{children || <pre style={block}>{text}</pre>}</div>
}

function Steps({ steps, result }) {
  const verdict = verdictLabel(result.verdict, { verdict_source: result.verdict_source })
  return <ol aria-label="How this verdict was decided" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
    {steps.map((step, index) => {
      const decisive = step.state === 'decisive'
      return <li key={`${step.step}-${index}`} data-state={step.state} className={decisive ? `rt-banner rt-tone-${verdict.tone}` : 'rt-banner'} style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <span><strong>{index + 1}. {STEP_NAMES[step.step] || step.step}</strong>{step.description ? `: ${step.description}` : ''}</span>
        <span className="rt-nowrap">{decisive ? <VerdictBadge verdict={result.verdict} source={result.verdict_source} /> : step.state === 'skipped' ? 'Skipped' : 'Undecided'}</span>
      </li>
    })}
  </ol>
}

function Body({ result, mode }) {
  const sent = result.prompt && result.prompt !== result.original_prompt
  const unavailable = result.response_withheld || result.content_expired
  const judge = result.judge
  return <>
    {result.evidence_steps?.length > 0 && <Steps steps={result.evidence_steps} result={result} />}
    {result.explanation && <p style={{ margin: 0, fontSize: 13 }}>{result.explanation}</p>}
    {judge && <div className="rt-banner rt-tone-neutral" style={{ display: 'block' }}><strong>Judge reasoning.</strong> {judge.reason} This is a judgement, not exact proof.{judge.model ? <> <span className="rt-muted">Judge model: {judge.model}</span></> : null}</div>}
    <Block title={sent ? 'Original attack' : 'Attack sent'} text={result.original_prompt ?? result.prompt} />
    {sent && <Block title="Sent to the model" text={result.prompt} />}
    {result.response_withheld
      ? <div className="rt-banner rt-tone-warn" role="note">Protected output was withheld. No reply text is available.</div>
      : result.content_expired
        ? <div className="rt-banner rt-tone-neutral" role="note">The stored reply has expired. The result details remain.</div>
        : result.response_text != null
          ? <Block title="Model reply, as received" text={result.response_text} />
          : <p className="rt-muted" style={{ margin: 0 }}>No reply text was recorded.</p>}
    {!unavailable && result.decoded_response && <Block title="Model reply, decoded" text={result.decoded_response} />}
    {result.paired && <div className="rt-banner" style={{ display: 'block' }}>
      <h3 style={heading}>{mode === 'protected' ? 'Same attack without policies' : 'Same attack with policies'}</h3>
      <VerdictBadge verdict={result.paired.verdict} source={result.paired.verdict_source} />
      {result.paired.prevention_stage ? <span className="rt-muted"> Stopped at: {String(result.paired.prevention_stage).replaceAll('_', ' ')}</span> : null}
    </div>}
    <p className="rt-muted" style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12 }}>
      <span>Latency {result.provider_latency_ms == null ? '–' : `${formatNumber(result.provider_latency_ms)} ms`}</span>
      <span>{result.total_tokens == null ? '–' : formatNumber(result.total_tokens)} tokens</span>
      <span>Estimated {result.estimated_cost_usd == null ? '–' : formatMoney(result.estimated_cost_usd)}</span>
    </p>
  </>
}

export default function AttackDetailDialog({ result, loading = false, error = '', onClose, input, mode = 'raw' }) {
  const open = Boolean(result || loading || error)
  const opener = useRef(null)
  const kicker = result ? [`Attack ${result.attack_index + 1}`, result.plugin_name, result.strategy_name, result.severity ? `Severity ${severityLabel(result.severity).label.toLowerCase()}` : null].filter(Boolean).join(' · ') : ''
  const title = result ? attackTitle(result) : loading ? 'Loading attack' : 'Attack unavailable'
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.() }}>
    <DialogContent className="rt-dialog" showCloseButton={false} data-input={input || lastInput}
      onOpenAutoFocus={() => { opener.current = document.activeElement }}
      onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus() }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--rt-line-subtle)' }}>
      <div>
        {kicker && <p className="rt-muted" style={{ margin: 0, fontSize: 12 }}>{kicker}</p>}
        <DialogTitle style={{ margin: 0, fontSize: 18 }}>{title}</DialogTitle>
        <DialogDescription className="rt-sr-only">Attack evidence, model reply and verdict details.</DialogDescription>
      </div>
      <DialogClose asChild><button type="button" className="rt-chip rt-press" aria-label="Close">Close</button></DialogClose>
    </div>
    <div style={{ display: 'grid', gap: 14, padding: 20, overflowY: 'auto' }}>
      {error ? <div className="rt-banner rt-tone-fail" role="alert">{error}</div>
        : loading && !result ? <p className="rt-muted" role="status">Loading attack details…</p>
          : result ? <Body result={result} mode={mode} /> : null}
    </div>
    </DialogContent>
  </Dialog>
}
