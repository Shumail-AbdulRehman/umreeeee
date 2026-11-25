import { useEffect } from 'react'
import { Activity, Building2, Clock3, PauseCircle } from 'lucide-react'
import { getPlatformOverview } from './platformService'
import usePlatformResource from './usePlatformResource'
import { AttentionPanel, CompanyActivityPanel, ErrorState, LoadingState, MetricStrip, PageHeading, PeriodControl, WorkspaceChart } from './PlatformComponents'

export default function PlatformOverview({ days = 7, onDaysChange, onMetadata }) {
  const { data, error, loading, reload } = usePlatformResource((signal) => getPlatformOverview({ days, signal }), [days])
  const metrics = data?.metrics
  useEffect(() => { if (data) onMetadata?.({ generatedAt: data.generated_at }) }, [data, onMetadata])
  return <>
    <PageHeading title="Platform overview" description="Monitor company adoption, setup and activity across Averiq."><PeriodControl days={days} onChange={onDaysChange} /></PageHeading>
    {loading ? <LoadingState label="Loading platform overview…" /> : error ? <ErrorState error={error} onRetry={reload} /> : data ? <>
      <MetricStrip items={[
        { label: 'Total companies', value: metrics.total_companies, description: 'All registered companies', tone: 'violet', icon: Building2 },
        { label: 'Companies using Averiq', value: metrics.using_companies, description: `Submitted in the last ${days} days`, tone: 'green', icon: Activity },
        { label: 'Onboarding', value: metrics.onboarding_companies, description: 'Verification or setup pending', tone: 'amber', icon: Clock3 },
        { label: 'Suspended', value: metrics.suspended_companies, description: 'Workspace access paused', tone: 'rose', icon: PauseCircle },
      ]} />
      <div className="dashboard-grid"><WorkspaceChart series={data.series} window={data.window} /><AttentionPanel items={data.attention.items} total={data.attention.total} /></div>
      <CompanyActivityPanel companies={data.companies} />
      <p className="platform-data-caption">Usage includes recorded workspace submissions. Open violations show the current backlog.</p>
    </> : null}
  </>
}
