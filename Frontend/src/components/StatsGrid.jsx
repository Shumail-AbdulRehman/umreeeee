export default function StatsGrid({ items }) {
  return (
    <div className="grid row-2">
      {items.map((item) => (
        <div className="card" key={item.title}>
          <div className="card-head">
            <h3>{item.title}</h3>
            <span className="hint">{item.hint}</span>
          </div>
          <div className="card-body">
            <div className="rounded-[8px] border border-[var(--line-2)] bg-[var(--panel-2)] p-4">
              <div className="mono text-[22px] font-semibold text-[var(--ink)]">{item.value}</div>
              <div className="mt-1 text-[11.5px] text-[var(--ink-3)]">{item.detail}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
