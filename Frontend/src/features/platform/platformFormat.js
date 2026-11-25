const dateOnlyFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })

export function formatDate(value, { relative = false, dateOnly = false } = {}) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  if (relative) {
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`
  }
  return `${(dateOnly ? dateOnlyFormatter : dateTimeFormatter).format(date)}${dateOnly ? '' : ' · UTC'}`
}
