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

// Verdict: pass (Defended, or Answered for a control), fail (Unsafe),
// inconclusive, error, pending (Judging). A judge verdict gets " · judged".
export function verdictLabel(verdict, { verdict_source, control = false } = {}) {
  const key = norm(verdict)
  if (key === 'pending' || key === 'judging') return { label: 'Judging', tone: 'accent', judged: false }
  const judged = verdict_source === 'judge'
  let base
  switch (key) {
    case 'pass': base = { label: control ? 'Answered' : 'Defended', tone: 'pass' }; break
    case 'fail': base = { label: 'Unsafe', tone: 'fail' }; break
    case 'inconclusive': base = { label: 'Inconclusive', tone: 'warn' }; break
    case 'error': base = { label: 'Error', tone: 'neutral' }; break
    default: return { ...(missing(verdict) ? notScoredLabel() : fallback(verdict)), judged: false }
  }
  return { label: judged ? `${base.label} · judged` : base.label, tone: base.tone, judged }
}

// Test status. Running with a percentage reads "Running · 46%".
export function statusLabel(status, percent) {
  const key = norm(status)
  if (key === 'running') {
    const value = percent == null || percent === '' ? NaN : Number(percent)
    if (Number.isFinite(value)) {
      return { label: `Running · ${Math.round(Math.min(100, Math.max(0, value)))}%`, tone: 'accent' }
    }
    return { label: 'Running', tone: 'accent' }
  }
  const known = {
    draft: ['Draft', 'neutral'],
    queued: ['Queued', 'neutral'],
    cancelling: ['Cancelling', 'warn'],
    completed: ['Completed', 'pass'],
    partially_failed: ['Partially failed', 'warn'],
    failed: ['Failed', 'fail'],
    cancelled: ['Cancelled', 'neutral'],
  }
  if (known[key]) return { label: known[key][0], tone: known[key][1] }
  return missing(status) ? notScoredLabel() : fallback(status)
}

// Risk level: Critical, High, Medium, Low, None.
export function levelLabel(level) {
  const known = {
    critical: ['Critical', 'critical'],
    high: ['High', 'fail'],
    medium: ['Medium', 'warn'],
    low: ['Low', 'pass'],
    none: ['None', 'neutral'],
  }
  const key = norm(level)
  if (known[key]) return { label: known[key][0], tone: known[key][1] }
  return missing(level) ? notScoredLabel() : fallback(level)
}

// Plugin severity: critical and high read as fail, medium as warn, low as pass.
export function severityLabel(severity) {
  const known = {
    critical: ['Critical', 'fail'],
    high: ['High', 'fail'],
    medium: ['Medium', 'warn'],
    low: ['Low', 'pass'],
  }
  const key = norm(severity)
  if (known[key]) return { label: known[key][0], tone: known[key][1] }
  return missing(severity) ? notScoredLabel() : fallback(severity)
}

// Test mode: raw (neutral) or protected (accent).
export function modeLabel(mode) {
  const key = norm(mode)
  if (key === 'raw') return { label: 'Raw', tone: 'neutral' }
  if (key === 'protected') return { label: 'Protected', tone: 'accent' }
  return missing(mode) ? notScoredLabel() : fallback(mode)
}

// Framework control status: failed, passed, not_tested.
export function controlStatusLabel(status) {
  const known = {
    failed: ['Failed', 'fail'],
    passed: ['Passed', 'pass'],
    not_tested: ['Not tested', 'neutral'],
  }
  const key = norm(status)
  if (known[key]) return { label: known[key][0], tone: known[key][1] }
  return missing(status) ? notScoredLabel() : fallback(status)
}

// Where a verdict's evidence came from: policy block, exact evidence, LLM judge.
export function evidenceSourceLabel(source) {
  const known = {
    policy: 'Policy block',
    exact: 'Exact evidence',
    judge: 'LLM judge',
  }
  const key = norm(source)
  if (known[key]) return { label: known[key], tone: 'neutral' }
  return missing(source) ? notScoredLabel() : fallback(source)
}
