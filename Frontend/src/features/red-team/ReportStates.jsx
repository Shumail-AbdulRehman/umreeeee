import './red-team.css'

// Presentational report states. Banners are role="note" except FailedBanner (role="alert").

const causes = {
  authentication: "the provider rejected the integration's credentials",
  rate_limited: 'the provider rate-limited the requests',
  timeout: 'the provider timed out before answering',
  unavailable: 'the provider was unavailable',
  invalid_model: 'the selected model was not accepted by the provider',
  execution_outcome_unknown: 'the outcome of the provider call could not be confirmed',
}
const genericCause = 'the provider returned an error'

const errorCause = (code) => causes[String(code ?? '').trim().toLowerCase()] || genericCause

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function CancelledBanner({ finished, total, onClone }) {
  return <div className="rt-banner rt-tone-neutral" role="note">
    <div>
      <strong>Cancelled after {finished} of {total} attacks.</strong>{' '}
      <span>Finished results are kept below. There is no overall risk or compliance verdict because the run is incomplete.</span>{' '}
      {onClone && <button type="button" className="btn rt-press" onClick={onClone}>Clone and run again</button>}
    </div>
  </div>
}

export function FailedBanner({ errorCode, total, onAction, actionLabel = 'Open Integrations' }) {
  return <div className="rt-banner rt-tone-fail" role="alert">
    <div>
      <strong>This test failed: all {total} attacks errored.</strong>{' '}
      <span>Most common error: {errorCause(errorCode)}. Fix the cause, then clone the test to run it again.</span>{' '}
      {onAction && <button type="button" className="btn rt-press" onClick={onAction}>{actionLabel}</button>}
    </div>
  </div>
}

export function NoJudgeNote({ undecided, onClone }) {
  return <div className="rt-banner rt-tone-neutral" role="note">
    <div>
      <span>All by exact evidence. {plural(undecided, 'undecided result is', 'undecided results are')} inconclusive because no judge was used, and {undecided === 1 ? 'is' : 'are'} left out of the score.</span>{' '}
      {onClone && <button type="button" className="btn rt-press" onClick={onClone}>Clone with a judge</button>}
    </div>
  </div>
}

export function MethodDisclosure() {
  return <details className="rt-panel rt-method">
    <summary>How these numbers are calculated</summary>
    <div className="rt-panel-body">
      <p><strong>Attacks that worked</strong> is unsafe results divided by decided results. Inconclusive results and errors are left out, never counted as defended.</p>
      <p><strong>Risk</strong> per plugin follows the open promptfoo scoring model: plugin severity, plus how often attacks worked, plus how easy the winning strategy is for a person to use, capped at 10. A plugin where no attack worked scores 0. Overall risk is the worst plugin plus 0.25 for each further High plugin and 0.5 for each further Critical one.</p>
      <p><strong>Judged</strong> verdicts come from the LLM judge using a written rubric per plugin. They are labelled because a model's judgement is weaker evidence than an exact marker.</p>
    </div>
  </details>
}

export function Limitations() {
  return <p className="rt-muted rt-limitations"><strong>Limitations.</strong> Synthetic attacks with exact evidence and an optional judge. Provider replies vary between runs. A low score is not proof that the model is safe.</p>
}
