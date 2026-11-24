import { describe, expect, it } from 'vitest'
import {
  controlStatusLabel,
  decisionLabel,
  evidenceSourceLabel,
  failureReasonLabel,
  frameworkLabel,
  levelLabel,
  modeLabel,
  notScored,
  phaseLabel,
  severityLabel,
  statusLabel,
  verdictLabel,
} from './labels.js'

describe('verdictLabel', () => {
  it('labels a judged fail as Unsafe · judged with the fail tone', () => {
    expect(verdictLabel('fail', { verdict_source: 'judge' })).toEqual({ label: 'Unsafe · judged', tone: 'fail', judged: true })
  })
  it('labels an exact pass as Defended', () => {
    expect(verdictLabel('pass', { verdict_source: 'exact' })).toEqual({ label: 'Defended', tone: 'pass', judged: false })
  })
  it('labels a control pass as Answered', () => {
    expect(verdictLabel('pass', { verdict_source: 'exact', control: true })).toEqual({ label: 'Answered', tone: 'pass', judged: false })
  })
  it('adds the judged suffix to a judged pass', () => {
    expect(verdictLabel('pass', { verdict_source: 'judge' }).label).toBe('Defended · judged')
  })
  it('uses the explicit source and only marks decided promptfoo verdicts as graded', () => {
    expect(verdictLabel('pass', { verdict_source: 'grader' })).toEqual({ label: 'Defended · graded', tone: 'pass', judged: true })
    expect(verdictLabel('pass', { verdict_source: 'policy' })).toEqual({ label: 'Defended', tone: 'pass', judged: false })
    expect(verdictLabel('pass', { verdict_source: 'none' }).judged).toBe(false)
    expect(verdictLabel('error', { verdict_source: 'grader' }).judged).toBe(false)
    expect(verdictLabel('pending', { verdict_source: 'grader' }).judged).toBe(false)
  })
  it('labels inconclusive, error and pending', () => {
    expect(verdictLabel('inconclusive').label).toBe('Inconclusive')
    expect(verdictLabel('inconclusive').tone).toBe('warn')
    expect(verdictLabel('error').label).toBe('Error')
    expect(verdictLabel('pending')).toEqual({ label: 'Judging', tone: 'accent', judged: false })
  })
  it('returns readable text for unknown and missing values', () => {
    expect(verdictLabel('partly_safe')).toEqual({ label: 'partly safe', tone: 'neutral', judged: false })
    expect(verdictLabel(undefined)).toEqual({ label: notScored, tone: 'neutral', missing: true, judged: false })
  })
})

describe('statusLabel', () => {
  it('shows the running percentage', () => {
    expect(statusLabel('running', 46)).toEqual({ label: 'Running · 46%', tone: 'accent' })
  })
  it('shows Running without a percentage', () => {
    expect(statusLabel('running').label).toBe('Running')
    expect(statusLabel('running', ' ').label).toBe('Running')
    expect(statusLabel('running', 0).label).toBe('Running · 0%')
  })
  it('labels terminal and transitional statuses', () => {
    expect(statusLabel('draft')).toEqual({ label: 'Draft', tone: 'neutral' })
    expect(statusLabel('queued')).toEqual({ label: 'Queued', tone: 'neutral' })
    expect(statusLabel('generating')).toEqual({ label: 'Generating', tone: 'accent' })
    expect(statusLabel('partially_failed')).toEqual({ label: 'Partially failed', tone: 'warn' })
    expect(statusLabel('completed').tone).toBe('pass')
    expect(statusLabel('failed').tone).toBe('fail')
    expect(statusLabel('cancelling').label).toBe('Cancelling')
    expect(statusLabel('cancelled')).toEqual({ label: 'Cancelled', tone: 'neutral' })
  })
  it('returns readable text for unknown statuses', () => {
    expect(statusLabel('archived_soon').label).toBe('archived soon')
  })
})

describe('run phases and decisions', () => {
  it('labels each run phase as the job progresses', () => {
    expect(phaseLabel('claimed')).toEqual({ label: 'Preparing run', tone: 'neutral' })
    expect(phaseLabel('generating')).toEqual({ label: 'Generating attacks (promptfoo hosted)', tone: 'accent' })
    expect(phaseLabel('evaluating')).toEqual({ label: 'Running attacks', tone: 'accent' })
    expect(phaseLabel('importing')).toEqual({ label: 'Grading and importing results', tone: 'accent' })
    expect(phaseLabel('finished')).toEqual({ label: 'Finished', tone: 'neutral' })
  })

  it('distinguishes allowed, blocked and error decisions', () => {
    expect(decisionLabel('allowed')).toEqual({ label: 'Allowed', tone: 'pass' })
    expect(decisionLabel('blocked_input')).toEqual({ label: 'Blocked input', tone: 'fail' })
    expect(decisionLabel('blocked_output')).toEqual({ label: 'Blocked output', tone: 'fail' })
    expect(decisionLabel('error')).toEqual({ label: 'Error', tone: 'neutral' })
  })

  it('distinguishes unknown labels from missing ones across registries', () => {
    for (const label of [statusLabel, phaseLabel, decisionLabel, evidenceSourceLabel, severityLabel, levelLabel, modeLabel, controlStatusLabel, failureReasonLabel, frameworkLabel]) {
      expect(label('new_value')).toEqual({ label: 'new value', tone: 'neutral' })
      expect(label('constructor')).toEqual({ label: 'constructor', tone: 'neutral' })
      expect(label(' ')).toEqual({ label: notScored, tone: 'neutral', missing: true })
    }
  })
})

describe('failureReasonLabel', () => {
  it.each([
    ['suite_contains_secret', 'Generated suite contains a secret'],
    ['results_too_large', 'Results are too large to import'],
    ['target_key_unavailable', 'Target integration key unavailable'],
    ['grader_key_unavailable', 'Grader integration key unavailable'],
    ['unsupported_provider', 'Unsupported provider'],
  ])('labels %s', (reason, label) => {
    expect(failureReasonLabel(reason)).toEqual({ label, tone: 'fail' })
  })
})

describe('frameworkLabel', () => {
  it.each([
    ['nist_ai_rmf', 'NIST AI RMF'],
    ['eu:ai-act', 'EU AI Act'],
    ['owasp:llm', 'OWASP LLM Top 10'],
    ['owasp:api', 'OWASP API Top 10'],
    ['mitre:atlas', 'MITRE ATLAS'],
    ['owasp:agentic', 'OWASP Agentic AI'],
    ['iso:42001', 'ISO/IEC 42001'],
    ['gdpr', 'EU GDPR'],
    ['dod:ai:ethics', 'DoD AI Ethical Principles'],
  ])('labels %s', (id, label) => {
    expect(frameworkLabel(id)).toEqual({ label, tone: 'neutral' })
  })
})

describe('levelLabel', () => {
  it('maps the five levels with tones', () => {
    expect(levelLabel('critical')).toEqual({ label: 'Critical', tone: 'critical' })
    expect(levelLabel('High')).toEqual({ label: 'High', tone: 'fail' })
    expect(levelLabel('medium')).toEqual({ label: 'Medium', tone: 'warn' })
    expect(levelLabel('low')).toEqual({ label: 'Low', tone: 'pass' })
    expect(levelLabel('none')).toEqual({ label: 'None', tone: 'neutral' })
  })
  it('returns Not scored for missing and readable text for unknown', () => {
    expect(levelLabel(null).label).toBe(notScored)
    expect(levelLabel('extreme_plus').label).toBe('extreme plus')
  })
})

describe('severityLabel, modeLabel, controlStatusLabel, evidenceSourceLabel', () => {
  it('maps severity', () => {
    expect(severityLabel('critical')).toEqual({ label: 'Critical', tone: 'fail' })
    expect(severityLabel('high').tone).toBe('fail')
    expect(severityLabel('medium').tone).toBe('warn')
    expect(severityLabel('low').label).toBe('Low')
  })
  it('maps mode', () => {
    expect(modeLabel('raw')).toEqual({ label: 'Raw', tone: 'neutral' })
    expect(modeLabel('protected')).toEqual({ label: 'Protected', tone: 'accent' })
  })
  it('maps control status', () => {
    expect(controlStatusLabel('failed')).toEqual({ label: 'Failed', tone: 'fail' })
    expect(controlStatusLabel('passed').label).toBe('Passed')
    expect(controlStatusLabel('not_tested')).toEqual({ label: 'Not tested', tone: 'neutral' })
  })
  it('maps evidence source', () => {
    expect(evidenceSourceLabel('judge').label).toBe('LLM judge')
    expect(evidenceSourceLabel('exact').label).toBe('Exact evidence')
    expect(evidenceSourceLabel('policy').label).toBe('Policy block')
    expect(evidenceSourceLabel('grader')).toEqual({ label: 'promptfoo grader', tone: 'neutral' })
    expect(evidenceSourceLabel('none')).toEqual({ label: 'No verdict source', tone: 'neutral' })
  })
})
