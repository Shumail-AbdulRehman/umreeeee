import { useRef } from 'react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { formatMoney, formatNumber, readable } from '../../lib/format.js'
import { decisionLabel, evidenceSourceLabel, severityLabel } from './labels.js'
import { VerdictBadge } from './ResultsTable.jsx'
import './red-team.css'

const HEADING = 'mb-2! text-xs! font-semibold text-[var(--rt-ink-secondary)]'
const TEXT_BLOCK = 'm-0 max-h-44 overflow-auto rounded-[7px] border border-[var(--rt-line)] bg-[var(--rt-surface-subtle)] px-3 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere'

function ContentBlock({ title, text, placeholder }) {
  return <section>
    <h3 className={HEADING}>{title}</h3>
    {placeholder
      ? <p className="rt-muted m-0">{placeholder}</p>
      : <pre className={TEXT_BLOCK} role="region" aria-label={title} tabIndex={0}>{text}</pre>}
  </section>
}

function PolicyEvidence({ evidence = [] }) {
  const matches = (evidence ?? []).filter((rule) => rule?.outcome === 'match' && rule.field && rule.field !== 'system_prompt')
  return <section>
    <h3 className={HEADING}>Policy evidence</h3>
    {matches.length > 0 ? <ul aria-label="Matched policy rules" className="grid gap-2">
      {matches.map((rule, index) => <li key={`${rule.policy_id}-${rule.rule_id}-${rule.field}-${index}`} className="rt-banner block wrap-anywhere">
        <strong>{rule.policy_name || rule.policy_id || 'Policy match'}</strong>
        <div>{[rule.rule_name || rule.rule_id || rule.type, readable(rule.field)].filter(Boolean).join(' · ')}</div>
      </li>)}
    </ul> : <p className="rt-muted m-0">No policy matches were recorded.</p>}
  </section>
}

function DetailBody({ result, mode, graderModel }) {
  const decision = decisionLabel(result.decision)
  const source = evidenceSourceLabel(result.verdict_source ?? 'none')
  const model = result.grader_model || graderModel
  const expired = result.content_expired
  const prompt = result.prompt
  const reply = result.response_text
  const promptPlaceholder = expired ? 'The stored attack prompt has expired.' : prompt == null ? 'No attack prompt was recorded.' : ''
  const replyPlaceholder = result.response_withheld || result.decision === 'blocked_output' ? 'An organization policy withheld the model reply.'
    : expired ? 'The stored model reply has expired.' : reply == null ? 'No model reply was recorded.' : ''
  const latency = result.latency_ms ?? result.provider_latency_ms
  const tokens = result.total_tokens ?? result.token_usage?.total

  return <>
    <section>
      <h3 className={HEADING}>Decision</h3>
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={result.verdict} source={result.verdict_source} />
        <span>{decision.missing ? 'Target decision unavailable' : decision.label}</span>
        <span className="rt-muted">{source.label}</span>
      </div>
    </section>
    <PolicyEvidence evidence={result.policy_evidence} />
    {result.verdict_source === 'grader' && <section>
      <h3 className={HEADING}>{model ? `promptfoo grader (${model})` : 'promptfoo grader'}</h3>
      <p className="m-0 whitespace-pre-wrap wrap-anywhere">{result.grader_reason || 'No grader reason was recorded.'}</p>
    </section>}
    <ContentBlock title="Attack prompt" text={prompt} placeholder={promptPlaceholder} />
    <ContentBlock title="Model reply" text={reply} placeholder={replyPlaceholder} />
    {result.paired && <section className="rt-banner block">
      <h3 className={HEADING}>{mode === 'protected' ? 'Same attack without policies' : 'Same attack with policies'}</h3>
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={result.paired.verdict} source={result.paired.verdict_source} />
        <span>{evidenceSourceLabel(result.paired.verdict_source ?? 'none').label}</span>
        {result.paired.decision && <span>{decisionLabel(result.paired.decision).label}</span>}
        {result.paired.prevention_stage && <span>Stopped at {readable(result.paired.prevention_stage)}</span>}
      </div>
    </section>}
    <div className="rt-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span>{latency == null ? 'Latency unavailable' : `Latency ${formatNumber(latency)} ms`}</span>
      <span>{tokens == null ? 'Token count unavailable' : `${formatNumber(tokens)} tokens`}</span>
      <span>{result.estimated_cost_usd == null ? 'Cost unavailable' : `Estimated ${formatMoney(result.estimated_cost_usd)}`}</span>
    </div>
  </>
}

export default function AttackDetailDialog({ result, loading = false, error = false, onClose, input = 'keyboard', mode = 'raw', graderModel }) {
  const open = Boolean(result || loading || error)
  const opener = useRef(null)
  const index = result?.test_idx ?? result?.attack_index
  const title = error ? 'Attack unavailable' : loading ? 'Loading attack' : index == null ? 'Attack result' : `Attack ${index + 1}`
  const metadata = result && [
    result.plugin_name || result.plugin_id,
    result.strategy_name || result.strategy_id,
    result.severity && `Severity ${severityLabel(result.severity).label.toLowerCase()}`,
    result.repeat_index > 0 && `Repeat ${result.repeat_index + 1}`,
  ].filter(Boolean).join(' · ')

  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.() }}>
    <DialogContent className="rt-dialog inset-0 m-auto h-fit max-w-none translate-none gap-0 sm:max-w-none motion-reduce:animate-none motion-reduce:transform-none data-[input=keyboard]:animate-none"
      showCloseButton={false} data-input={input}
      onOpenAutoFocus={() => { opener.current = document.activeElement }}
      onCloseAutoFocus={(event) => {
        if (opener.current?.isConnected) {
          event.preventDefault()
          opener.current.focus()
        }
      }}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--rt-line-subtle)] px-5 py-4">
        <div className="min-w-0 wrap-anywhere">
          <DialogTitle className="m-0 text-lg">{title}</DialogTitle>
          {metadata && <p className="rt-muted mt-1 text-xs">{metadata}</p>}
          <DialogDescription className="rt-sr-only">Attack evidence, model reply and verdict details.</DialogDescription>
        </div>
        <DialogClose asChild><button type="button" className="rt-chip rt-press">Close</button></DialogClose>
      </div>
      <div className="grid min-h-0 gap-4 overflow-y-auto p-5 text-[13px] wrap-anywhere">
        {error ? <p className="rt-banner rt-tone-fail" role="alert">Could not load attack details. Close this dialog and open the result again.</p>
          : loading ? <p className="rt-muted" role="status">Loading attack details…</p>
            : result && <DetailBody result={result} mode={mode} graderModel={graderModel} />}
      </div>
    </DialogContent>
  </Dialog>
}
