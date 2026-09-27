export default function ActivityChart() {
  const requests = [280, 302, 316, 344, 338, 366, 394, 382, 418, 436, 458, 449, 478, 501, 492, 516, 554, 572, 560, 584, 612, 604, 633, 646, 670, 689, 708, 734]
  const successful = requests.map((value, index) => value - [12, 14, 10, 18, 16, 21, 24, 22, 20, 28, 26, 25, 29, 31, 28, 30, 32, 34, 29, 33, 36, 31, 38, 40, 42, 39, 37, 35][index])
  const flagged = [11, 13, 12, 14, 16, 18, 20, 17, 21, 23, 20, 24, 25, 27, 26, 28, 30, 31, 29, 32, 34, 35, 38, 36, 39, 42, 40, 44]
  const blocked = [3, 4, 3, 5, 6, 5, 6, 4, 6, 7, 6, 8, 9, 8, 7, 9, 10, 10, 8, 10, 11, 10, 12, 11, 13, 14, 12, 15]

  return (
    <div className="card">
      <div className="card-head">
        <h3>Activity</h3>
        <span className="hint">requests over time · violations & blocks overlay</span>
        <div className="right">
          <div className="legend">
            <span><span className="sw" style={{ background: 'var(--indigo)' }} />Requests</span>
            <span><span className="sw" style={{ background: 'var(--emerald)' }} />Successful</span>
            <span><span className="sw" style={{ background: 'var(--amber)' }} />Flagged</span>
            <span><span className="sw" style={{ background: 'var(--rose)' }} />Blocked</span>
          </div>
          <div className="seg">
            <button>1h</button>
            <button className="on">1d</button>
            <button>1w</button>
          </div>
        </div>
      </div>
      <div className="card-body">
        <svg viewBox="0 0 1200 220" className="block h-[220px] w-full">
          {[14, 61, 108, 155, 202].map((y, index) => (
            <g key={y}>
              <line x1="42" x2="1186" y1={y} y2={y} stroke="var(--line-2)" strokeDasharray="2 3" />
              <text x="34" y={y + 3} textAnchor="end" fontSize="10" fill="var(--ink-4)" fontFamily="var(--font-mono)">
                {Math.round(740 - index * 185)}
              </text>
            </g>
          ))}

          <path
            d={`M 42 164 ${requests.map((value, index) => {
              const x = 42 + (index / (requests.length - 1)) * 1144
              const y = 194 - (value / 760) * 170
              return `${index === 0 ? '' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
            }).join(' ')} L 1186 194 L 42 194 Z`}
            fill="var(--indigo)"
            fillOpacity="0.10"
          />
          <path
            d={`M ${requests.map((value, index) => {
              const x = 42 + (index / (requests.length - 1)) * 1144
              const y = 194 - (value / 760) * 170
              return `${index === 0 ? `${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`}`
            }).join(' ')}`}
            fill="none"
            stroke="var(--indigo)"
            strokeWidth="2"
          />
          <path
            d={`M ${successful.map((value, index) => {
              const x = 42 + (index / (successful.length - 1)) * 1144
              const y = 194 - (value / 760) * 170
              return `${index === 0 ? `${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`}`
            }).join(' ')}`}
            fill="none"
            stroke="var(--emerald)"
            strokeWidth="1.4"
            strokeDasharray="3 3"
          />

          {flagged.map((value, index) => {
            const x = 42 + (index / (flagged.length - 1)) * 1144
            const fHeight = (value / 50) * 170
            const bHeight = (blocked[index] / 50) * 170

            return (
              <g key={x}>
                <rect x={x - 18} y={194 - fHeight} width="36" height={fHeight} rx="2" fill="var(--amber)" fillOpacity="0.45" />
                <rect x={x - 18} y={194 - bHeight} width="36" height={bHeight} rx="2" fill="var(--rose)" fillOpacity="0.85" />
              </g>
            )
          })}

          <line x1="1186" x2="1186" y1="14" y2="194" stroke="var(--ink)" strokeDasharray="2 3" strokeOpacity="0.25" />
          <circle cx="1186" cy={194 - (requests.at(-1) / 760) * 170} r="3.5" fill="white" stroke="var(--indigo)" strokeWidth="1.8" />

          {[0, 4, 8, 12, 16, 20, 24].map((index) => (
            <text key={index} x={42 + (index / (requests.length - 1)) * 1144} y="212" textAnchor="middle" fontSize="10" fill="var(--ink-4)" fontFamily="var(--font-mono)">
              {['3/28', '4/1', '4/5', '4/9', '4/13', '4/17', '4/21'][Math.floor(index / 4)]}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}
