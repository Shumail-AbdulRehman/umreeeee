import { useCallback, useEffect, useState } from 'react'
import PlatformShell from './PlatformShell'
import PlatformOverview from './PlatformOverview'
import PlatformCompanies from './PlatformCompanies'
import PlatformCompany from './PlatformCompany'
import PlatformAudit from './PlatformAudit'
import { mergePlatformParams, platformDays, platformHash } from './platformNavigation'

export default function PlatformWorkspace({ currentUser, route = 'platform-overview', params = new URLSearchParams(), onLogout }) {
  const [preferredDays, setPreferredDays] = useState(() => platformDays(params))
  const explicitDays = params.has('days') ? platformDays(params) : null
  // Back/Forward can restore a URL range without calling the period control.
  if (explicitDays !== null && preferredDays !== explicitDays) setPreferredDays(explicitDays)
  const days = explicitDays ?? preferredDays
  const companyId = params.get('id') || ''
  const identity = `${route}:${companyId}`
  const [metadata, setMetadata] = useState({ identity: null })
  const title = { 'platform-overview': 'Platform overview', 'platform-companies': 'Companies', 'platform-company': 'Company detail', 'platform-audit': 'Audit log' }[route] || 'Platform overview'

  const changeParams = useCallback((patch) => {
    window.location.hash = platformHash(route, mergePlatformParams(params, patch))
  }, [route, params])
  const reportMetadata = useCallback((values) => setMetadata({ identity, ...values }), [identity])

  function changeDays(value) {
    setPreferredDays(value)
    changeParams({ days: value, page: null })
  }

  useEffect(() => { document.title = `${title} · Averiq` }, [title])

  if (currentUser?.role !== 'super_admin') return <main className="auth-loading"><div><h1>Platform access required</h1><p>This workspace is available to platform administrators.</p><a href="#insights">Return to your workspace</a></div></main>

  let screen
  if (route === 'platform-companies') screen = <PlatformCompanies days={days} onDaysChange={changeDays} params={params} onParamsChange={changeParams} onMetadata={reportMetadata} />
  else if (route === 'platform-company') screen = <PlatformCompany key={companyId} companyId={companyId} days={days} onDaysChange={changeDays} onMetadata={reportMetadata} />
  else if (route === 'platform-audit') screen = <PlatformAudit params={params} onParamsChange={changeParams} />
  else screen = <PlatformOverview days={days} onDaysChange={changeDays} onMetadata={reportMetadata} />

  const currentMetadata = metadata.identity === identity ? metadata : {}
  return <PlatformShell user={currentUser} route={route} companyName={currentMetadata.companyName} generatedAt={currentMetadata.generatedAt} onLogout={onLogout}>{screen}</PlatformShell>
}
