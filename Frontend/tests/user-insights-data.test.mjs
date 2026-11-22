import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dailyOutcomes, executionOutcomes, insightParams } from '../src/pages/user-insights-data.js'

test('all analytics requests can share a precise timezone-aware interval within the supported limit', () => {
  const end = new Date('2026-10-11T09:30:00.000Z')
  for (const days of [7, 30, 90]) {
    const interval = insightParams(days, 'user-one', end)
    const query = new URLSearchParams(interval.query.slice(1))
    assert.equal(Date.parse(query.get('to')) - Date.parse(query.get('from')), days * 86400000)
    assert.equal(query.get('user_id'), 'user-one')
    assert.equal(query.get('to'), end.toISOString())
  }
  assert.equal(new URLSearchParams(insightParams(7, '', end).query.slice(1)).has('user_id'), false)
})

test('daily aggregation preserves UTC boundaries, zero days, and separate failure outcomes', () => {
  const rows = dailyOutcomes([
    { date: '2026-10-05T00:00:00Z', status: 'allowed', count: 4 },
    { date: '2026-10-05T00:00:00Z', status: 'blocked_input', count: 2 },
    { date: '2026-10-05T00:00:00Z', status: 'blocked_output', count: 1 },
    { date: '2026-10-07T00:00:00Z', status: 'provider_error', count: 3 },
    { date: '2026-10-07T00:00:00Z', status: 'interrupted', count: 1 },
    { date: '2026-10-07T00:00:00Z', status: 'processing', count: 2 },
    { date: '2026-10-08T00:00:00Z', status: 'allowed', count: 100 },
  ], '2026-10-05T09:30:00Z', '2026-10-08T00:00:00Z')
  assert.equal(rows.length, 3)
  assert.equal(rows[0].blocked, 3)
  assert.equal(rows[1].allowed, 0)
  assert.equal(rows[2].errors, 4)
  assert.equal(rows[2].processing, 2)
  assert.equal(rows.reduce((sum, row) => sum + row.allowed, 0), 4)
  assert.deepEqual(dailyOutcomes([], '2026-10-05T00:00:00Z', '2026-10-08T00:00:00Z'), [])
})

test('outcome distribution keeps technical errors separate from blocked prompts', () => {
  const rows = executionOutcomes({ allowed: 5, blocked: 2, errors: { provider_error: 3, validation_error: 1 }, processing: 1 })
  assert.equal(rows.find((row) => row.label === 'Blocked').count, 2)
  assert.equal(rows.find((row) => row.label === 'Technical errors').count, 4)
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), 12)
})
