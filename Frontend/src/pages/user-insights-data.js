// Analytics parameters use the existing timezone-aware, at-most-90-day contract.
export function insightParams(days, userId, end = new Date()) {
  const to = end.toISOString()
  const from = new Date(end.getTime() - days * 86400000).toISOString()
  const params = new URLSearchParams({ from, to })
  if (userId) params.set('user_id', userId)
  return { query: `?${params}`, from, to }
}

export function dailyOutcomes(items, from, to) {
  if (!items.length) return []
  const days = new Map()
  // Zeroes represent dates in the requested interval with no recorded submissions.
  const first = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const end = Date.parse(to)
  for (let stamp = first; stamp < end; stamp += 86400000) {
    const date = new Date(stamp).toISOString().slice(0, 10)
    days.set(date, { date, label: new Date(stamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), allowed: 0, blocked: 0, errors: 0, processing: 0, other: 0 })
  }
  for (const item of items) {
    const day = days.get(item.date.slice(0, 10))
    if (!day) continue
    const category = item.status === 'allowed' ? 'allowed' : item.status?.startsWith('blocked') ? 'blocked'
      : item.status === 'processing' ? 'processing' : item.status?.endsWith('error') || item.status === 'interrupted' ? 'errors' : 'other'
    day[category] += Number(item.count || 0)
  }
  return [...days.values()]
}

export function executionOutcomes(summary) {
  return [
    { label: 'Allowed', count: Number(summary.allowed || 0), color: 'var(--chart-1)' },
    { label: 'Blocked', count: Number(summary.blocked || 0), color: 'var(--chart-2)' },
    { label: 'Technical errors', count: Object.values(summary.errors || {}).reduce((sum, value) => sum + Number(value || 0), 0), color: 'var(--ink-3)' },
    { label: 'Processing', count: Number(summary.processing || 0), color: 'var(--chart-4)' },
  ]
}
