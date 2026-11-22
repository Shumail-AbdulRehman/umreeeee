import { readable } from '../../lib/format.js'

// Display text and tone for Red Team values. Tones match the rt-tone-* classes
// in red-team.css: pass, fail, warn, accent, critical, neutral.
// Missing values (null, undefined, empty) return `notScored`; unknown values
// return readable text. Neither path returns undefined.

export const notScored = 'Not scored'

const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
const missing = (value) => value == null || String(value).trim() === ''
const fallback = (value) => ({ label: readable(value), tone: 'neutral' })
const notScoredLabel = () => ({ label: notScored, tone: 'neutral', missing: true })

function labelFor(value, labels) {
  const key = norm(value)
  if (Object.hasOwn(labels, key)) {
    const [label, tone] = labels[key]
    return { label, tone }
  }
  return missing(value) ? notScoredLabel() : fallback(value)
}

// Legacy judge verdicts keep their wording while promptfoo decisions use "graded".
export function verdictLabel(verdict, { verdict_source, control = false } = {}) {
  const key = norm(verdict)
  if (key === 'pending' || key === 'judging') return { label: 'Judging', tone: 'accent', judged: false }
  const labels = {
    pass: [control ? 'Answered' : 'Defended', 'pass'],
    fail: ['Unsafe', 'fail'],
    inconclusive: ['Inconclusive', 'warn'],
    error: ['Error', 'neutral'],
  }
  const base = labelFor(verdict, labels)
  const source = norm(verdict_source)
  if (source === 'grader' && (key === 'pass' || key === 'fail')) return { ...base, label: `${base.label} · graded`, judged: true }
  if (source === 'judge' && Object.hasOwn(labels, key)) return { ...base, label: `${base.label} · judged`, judged: true }
  return { ...base, judged: false }
}

// Test status. Running with a percentage reads "Running · 46%".
export function statusLabel(status, percent) {
  const key = norm(status)
  if (key === 'running') {
    const value = missing(percent) ? NaN : Number(percent)
    if (Number.isFinite(value)) {
      return { label: `Running · ${Math.round(Math.min(100, Math.max(0, value)))}%`, tone: 'accent' }
    }
    return { label: 'Running', tone: 'accent' }
  }
  return labelFor(status, {
    draft: ['Draft', 'neutral'],
    queued: ['Queued', 'neutral'],
    generating: ['Generating', 'accent'],
    cancelling: ['Cancelling', 'warn'],
    completed: ['Completed', 'pass'],
    partially_failed: ['Partially failed', 'warn'],
    failed: ['Failed', 'fail'],
    cancelled: ['Cancelled', 'neutral'],
  })
}

export function phaseLabel(phase) {
  return labelFor(phase, {
    claimed: ['Preparing run', 'neutral'],
    generating: ['Generating attacks (promptfoo hosted)', 'accent'],
    evaluating: ['Running attacks', 'accent'],
    importing: ['Grading and importing results', 'accent'],
    finished: ['Finished', 'neutral'],
  })
}

export function decisionLabel(decision) {
  return labelFor(decision, {
    allowed: ['Allowed', 'pass'],
    blocked_input: ['Blocked input', 'fail'],
    blocked_output: ['Blocked output', 'fail'],
    error: ['Error', 'neutral'],
  })
}

// Risk level: Critical, High, Medium, Low, None.
export function levelLabel(level) {
  return labelFor(level, {
    critical: ['Critical', 'critical'],
    high: ['High', 'fail'],
    medium: ['Medium', 'warn'],
    low: ['Low', 'pass'],
    none: ['None', 'neutral'],
  })
}

// Plugin severity: critical and high read as fail, medium as warn, low as pass.
export function severityLabel(severity) {
  return labelFor(severity, {
    critical: ['Critical', 'fail'],
    high: ['High', 'fail'],
    medium: ['Medium', 'warn'],
    low: ['Low', 'pass'],
  })
}

// Test mode: raw (neutral) or protected (accent).
export function modeLabel(mode) {
  return labelFor(mode, {
    raw: ['Raw', 'neutral'],
    protected: ['Protected', 'accent'],
  })
}

// Framework control status: failed, passed, not_tested.
export function controlStatusLabel(status) {
  return labelFor(status, {
    failed: ['Failed', 'fail'],
    passed: ['Passed', 'pass'],
    not_tested: ['Not tested', 'neutral'],
  })
}

export function evidenceSourceLabel(source) {
  return labelFor(source, {
    policy: ['Policy block', 'neutral'],
    grader: ['promptfoo grader', 'neutral'],
    none: ['No verdict source', 'neutral'],
    exact: ['Exact evidence', 'neutral'],
    judge: ['LLM judge', 'neutral'],
  })
}
