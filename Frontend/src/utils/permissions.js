export function isAdmin(user) { return ['org_admin', 'super_admin'].includes(user?.role) }
export function canOpenPage(user, page) {
  if (page === 'my-activity') return Boolean(user) && !isAdmin(user)
  return ['prompt-studio', 'activity-log', 'violations', 'catalog', 'latency', 'spend'].includes(page) || isAdmin(user)
}
