import MiniSpark from './MiniSpark'

export default function MetricCard({ label, value, unit, sub, delta, tone, spark }) {
  return (
    <div className="kpi">
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-val mono">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      <div className="kpi-row">
        <span className={`delta ${tone === 'up' ? 'up' : tone === 'warn' ? 'flat' : 'down'}`}>{delta}</span>
        <span className="text-[11px] text-[var(--ink-4)]">{sub}</span>
      </div>
      <MiniSpark points={spark} color={tone === 'up' ? 'var(--indigo)' : tone === 'warn' ? 'var(--amber)' : 'var(--rose)'} />
    </div>
  )
}
