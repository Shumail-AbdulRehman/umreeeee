import { useId } from 'react'
import { Tabs } from 'radix-ui'
import PluginTable from './PluginTable.jsx'
import StrategyBreakdown from './StrategyBreakdown.jsx'

export default function ReportBreakdown({ plugins, strategies, paired }) {
  const titleId = useId()

  return (
    <Tabs.Root className="rt-panel rt-report-breakdown" defaultValue="plugins">
      <div className="rt-panel-head">
        <h2 className="rt-panel-title" id={titleId}>Test breakdown</h2>
        <Tabs.List className="rt-breakdown-tabs" aria-labelledby={titleId}>
          <Tabs.Trigger value="plugins">Plugins</Tabs.Trigger>
          <Tabs.Trigger value="strategies">Strategies</Tabs.Trigger>
        </Tabs.List>
      </div>
      <Tabs.Content value="plugins" forceMount className="rt-breakdown-view">
        <PluginTable plugins={plugins} paired={paired} embedded />
      </Tabs.Content>
      <Tabs.Content value="strategies" forceMount className="rt-breakdown-view">
        <StrategyBreakdown strategies={strategies} embedded />
      </Tabs.Content>
    </Tabs.Root>
  )
}
