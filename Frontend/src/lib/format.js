export const formatNumber = (value) => value == null ? '—' : Number(value).toLocaleString()
export const formatMoney = (value) => value == null ? 'Unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: Number(value) > 0 && Number(value) < 1 ? 5 : 2 }).format(Number(value))
export const formatPercent = (value) => value == null ? 'No data' : `${(value * 100).toFixed(1)}%`
export const formatDate = (value) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
export const readable = (value = '') => String(value || 'Unknown').replaceAll('_', ' ')
