const platformRoutes = new Set(['platform-overview', 'platform-companies', 'platform-company', 'platform-audit'])

export function isPlatformRoute(route) { return platformRoutes.has(route) }

export function defaultPageForUser(user) {
  if (user?.role === 'super_admin') return 'platform-overview'
  return user?.role === 'org_admin' ? 'insights' : 'my-activity'
}

export function platformDays(params) { return params.get('days') === '30' ? 30 : 7 }

export function mergePlatformParams(params, patch) {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') next.delete(key)
    else next.set(key, String(value))
  }
  return next
}

export function platformHash(route, params = new URLSearchParams()) {
  const query = params.toString()
  return `${route}${query ? `?${query}` : ''}`
}
