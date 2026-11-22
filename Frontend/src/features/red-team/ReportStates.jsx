import { Button } from '../../components/ui/button.jsx'
import { formatNumber } from '../../lib/format.js'
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

const failureMessages = {
  no_tests_generated: ['promptfoo generated no attacks.', 'Check the test purpose and selected plugins, then clone the test and launch again.'],
  interrupted: ['The run stopped before evaluation finished.', 'Review any saved results below. Check that the Red Team worker is running, then clone the test to start a new run.'],
  promptfoo_unavailable: ['The Red Team worker could not start promptfoo.', 'Ask your administrator to restore the promptfoo runtime on the worker, then clone the test and launch again.'],
  promptfoo_api_key_missing: ['The promptfoo Cloud API key is missing.', 'Set PROMPTFOO_API_KEY in backend/.env before restarting the worker. Then clone the test and launch again.'],
  promptfoo_auth_failed: ['promptfoo Cloud rejected the API key.', 'Create a new key in promptfoo Cloud, set PROMPTFOO_API_KEY in backend/.env, and restart the worker. Then clone the test and launch again.'],
}

function failureMessage(failureReason, errorCode, total) {
  const code = String(failureReason ?? errorCode ?? '').trim().toLowerCase()
  if (Object.hasOwn(failureMessages, code)) return failureMessages[code]
  // The incumbent report page still passes provider error codes.
  if (failureReason == null && errorCode && Object.hasOwn(causes, code)) {
    const summary = total == null ? 'This test failed.' : `This test failed after ${formatNumber(total)} attack errors.`
    return [summary, `The most common error was that ${causes[code]}. Fix the provider integration, then clone the test and launch again.`]
  }
  return ['This test failed.', 'Ask your administrator to check the Red Team worker logs for this run. Once the issue is resolved, clone the test and launch again.']
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function CancelledBanner({ finished, total, onClone }) {
  const summary = finished == null ? 'Run cancelled.' : total == null
    ? `Cancelled after ${formatNumber(finished)} finished attacks.`
    : `Cancelled after ${formatNumber(finished)} of ${formatNumber(total)} attacks.`
  return <div className="rt-banner rt-tone-neutral" role="note">
    <div>
      <strong>{summary}</strong>{' '}
      <span>Review finished results below.</span>{' '}
      {onClone && <Button type="button" variant="outline" size="sm" className="max-[599px]:min-h-11" onClick={onClone}>Clone and run again</Button>}
    </div>
  </div>
}

export function FailedBanner({ failureReason, errorCode, total, onAction, actionLabel = 'Open Integrations' }) {
  const [summary, nextStep] = failureMessage(failureReason, errorCode, total)
  return <div className="rt-banner rt-tone-fail" role="alert">
    <div>
      <strong>{summary}</strong>{' '}
      <span>{nextStep}</span>{' '}
      {onAction && <Button type="button" variant="outline" size="sm" className="max-[599px]:min-h-11" onClick={onAction}>{actionLabel}</Button>}
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
      <p><strong>Attacks that worked</strong> is unsafe results divided by decided results. Only defended and unsafe results count toward this rate.</p>
      <p><strong>Risk</strong> per plugin follows the open promptfoo scoring model and combines plugin severity, how often attacks worked, and ease of attack, capped at 10. A plugin where no attack worked scores 0. Overall risk starts from the highest plugin score and accounts for additional High and Critical plugins.</p>
      <p><strong>Verdict sources.</strong> A confirmed policy block marks the result as defended. The promptfoo grader evaluates the remaining results against the plugin’s criteria.</p>
    </div>
  </details>
}

export function Limitations() {
  return <p className="rt-muted rt-limitations"><strong>Limitations.</strong> Results cover the generated attacks and the tested model configuration. Provider replies can vary between runs.</p>
}
