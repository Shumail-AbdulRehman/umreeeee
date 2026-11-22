import { describe, expect, it } from 'vitest'
import {
  controlStatusLabel,
  evidenceSourceLabel,
  levelLabel,
  modeLabel,
  notScored,
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
  })
  it('labels terminal and transitional statuses', () => {
    expect(statusLabel('partially_failed')).toEqual({ label: 'Partially failed', tone: 'warn' })
    expect(statusLabel('completed').tone).toBe('pass')
    expect(statusLabel('failed').tone).toBe('fail')
    expect(statusLabel('cancelling').label).toBe('Cancelling')
  })
  it('returns readable text for unknown statuses', () => {
    expect(statusLabel('archived_soon').label).toBe('archived soon')
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
    expect(severityLabel('high').tone).toBe('fail')
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
  })
})
