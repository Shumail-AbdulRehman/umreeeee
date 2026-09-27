export default function ActivityLogCard({ rows }) {
  return (
    <div className="card">
      <div className="tabs">
        <div className="tab active">All activity <span className="tcount">12,384</span></div>
        <div className="tab">Flagged <span className="tcount">241</span></div>
        <div className="tab">Blocked <span className="tcount">17</span></div>
        <div className="tab">Errors <span className="tcount">34</span></div>
      </div>
      <div className="act-head">
        <div />
        <div className="sortable">Time</div>
        <div className="sortable">User · Prompt</div>
        <div className="sortable">Model</div>
        <div className="sortable">Policy</div>
        <div className="num sortable">Tokens</div>
        <div className="num sortable">Cost</div>
        <div />
      </div>
      <div>
        {rows.map((row) => (
          <div className="act-row" key={row.time + row.user}>
            <div className={`flag ${row.flag}`}>{row.flag === 'ok' ? '✓' : row.flag === 'warn' ? '⚠' : '✕'}</div>
            <div className="t">{row.time}</div>
            <div className="u">
              <div className="av" style={{ background: row.bg }}>{row.user.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
              <div className="min-w-0 overflow-hidden">
                <div className="nm whitespace-nowrap">{row.user}</div>
                <div className="p">{row.prompt}</div>
              </div>
            </div>
            <div className="model">{row.model}</div>
            <div className="polcell">{row.policy === '—' ? <span className="text-[var(--ink-4)]">—</span> : <span className={`pill ${row.policyTone}`}>{row.policy}</span>}</div>
            <div className="tok">{row.tokens}</div>
            <div className="cost">{row.cost}</div>
            <div className="cursor-pointer text-center text-[var(--ink-4)]">⋯</div>
          </div>
        ))}
      </div>
      <div className="foot-act">
        <div>Showing 1–8 of 12,384</div>
        <div className="pg">
          <button>‹</button>
          <button className="on">1</button>
          <button>2</button>
          <button>3</button>
          <button>…</button>
          <button>1,548</button>
          <button>›</button>
        </div>
      </div>
    </div>
  )
}
