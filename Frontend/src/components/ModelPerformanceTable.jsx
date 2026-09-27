import { providerGradient } from '../utils/chartPaths'
import MiniSpark from './MiniSpark'

export default function ModelPerformanceTable({ rows }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Model performance</h3>
        <span className="hint">6 of 12 models · click column to sort</span>
        <div className="right">
          <span className="chip">Sort: Requests ↓</span>
          <span className="chip x">+ Column</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Status</th>
              <th className="num">Requests</th>
              <th className="num">Tokens</th>
              <th className="num">Cost</th>
              <th className="num">p95 latency</th>
              <th className="num">Error rate</th>
              <th className="num">Violations</th>
              <th>Safety / Risk</th>
              <th>7d trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.model}>
                <td>
                  <div className="provider">
                    <div className="logo" style={{ background: providerGradient(row.provider) }}>{row.abbr}</div>
                    <div>
                      <div className="name">{row.model}</div>
                      <div className="mv">{row.provider} · {row.version}</div>
                    </div>
                  </div>
                </td>
                <td><span className={`pill ${row.statusTone}`}>{row.status}</span></td>
                <td className="num">{row.req}</td>
                <td className="num">{row.tok}</td>
                <td className="num">{row.cost}</td>
                <td className="num">{row.p95}</td>
                <td className="num"><span className={`pill ${row.errTone}`}>{row.err}</span></td>
                <td className="num" style={{ color: row.violTone === 'rose' ? 'var(--rose)' : row.violTone === 'amber' ? 'var(--amber)' : 'var(--ink-3)', fontWeight: row.viol > 10 ? 600 : 500 }}>{row.viol}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="ratiobar">
                      <span className={row.safetyTone === 'green' ? '' : row.safetyTone === 'amber' ? 'warn' : 'bad'} style={{ width: `${row.safety}%` }} />
                    </div>
                    <span className="mono text-[11px] font-semibold" style={{ color: row.safetyTone === 'green' ? 'var(--emerald)' : row.safetyTone === 'amber' ? 'var(--amber)' : 'var(--rose)' }}>{row.safety}</span>
                  </div>
                </td>
                <td><MiniSpark points={row.trend} color="var(--ink-3)" width={70} className="micro" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
