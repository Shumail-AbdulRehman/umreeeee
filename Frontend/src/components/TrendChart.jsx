export default function TrendChart() {
  const stacks = [
    { color: 'var(--indigo)', values: [14, 15, 17, 18, 20, 22, 24, 25, 27, 30, 32, 34, 36, 38] },
    { color: 'var(--violet)', values: [9, 10, 10, 11, 12, 13, 14, 15, 15, 16, 18, 18, 20, 22] },
    { color: 'var(--amber)', values: [6, 7, 8, 8, 9, 11, 12, 12, 13, 13, 14, 15, 17, 18] },
    { color: 'var(--emerald)', values: [4, 5, 5, 6, 7, 7, 8, 9, 10, 10, 11, 12, 13, 14] },
  ]
  const totals = stacks[0].values.map((_, index) => stacks.reduce((sum, stack) => sum + stack.values[index], 0))
  const max = Math.max(...totals)

  return (
    <div className="card">
      <div className="card-head">
        <h3>Cost & volume</h3>
        <span className="hint">stacked by provider</span>
        <div className="right">
          <div className="legend">
            <span><span className="sw" style={{ background: 'var(--indigo)' }} />Gemini</span>
            <span><span className="sw" style={{ background: 'var(--violet)' }} />Groq</span>
            <span><span className="sw" style={{ background: 'var(--amber)' }} />OpenAI</span>
            <span><span className="sw" style={{ background: 'var(--emerald)' }} />Anthropic</span>
          </div>
        </div>
      </div>
      <div className="card-body">
        <svg viewBox="0 0 820 240" className="block h-[240px] w-full">
          {[10, 61, 112, 163, 214].map((y, index) => (
            <g key={y}>
              <line x1="36" x2="810" y1={y} y2={y} stroke="var(--line-2)" strokeDasharray="2 3" />
              <text x="30" y={y + 3} textAnchor="end" fontSize="10" fill="var(--ink-4)" fontFamily="var(--font-mono)">
                {Math.round(max - (max / 4) * index)}k
              </text>
            </g>
          ))}
          {stacks.map((stack, stackIndex) => {
            const topValues = stack.values.map((value, index) => stacks.slice(0, stackIndex).reduce((sum, item) => sum + item.values[index], value))
            const baseValues = stack.values.map((_, index) => stacks.slice(0, stackIndex).reduce((sum, item) => sum + item.values[index], 0))
            const top = topValues.map((value, index) => {
              const x = 36 + (index / (topValues.length - 1)) * 774
              const y = 216 - (value / max) * 182
              return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
            }).join(' ')
            const bottom = baseValues.map((_, index) => {
              const reverseIndex = baseValues.length - 1 - index
              const x = 36 + (reverseIndex / (baseValues.length - 1)) * 774
              const y = 216 - (baseValues[reverseIndex] / max) * 182
              return `L ${x.toFixed(2)} ${y.toFixed(2)}`
            }).join(' ')

            return (
              <g key={stack.color}>
                <path d={`${top} ${bottom} Z`} fill={stack.color} fillOpacity="0.14" />
                <path d={top} fill="none" stroke={stack.color} strokeWidth="1.6" />
              </g>
            )
          })}
          <line x1="810" x2="810" y1="10" y2="216" stroke="var(--ink)" strokeDasharray="2 3" strokeOpacity="0.25" />
          <text x="804" y="24" textAnchor="end" fontSize="10" fill="var(--ink-3)" fontFamily="var(--font-mono)">today</text>
          {['4/11', '4/13', '4/15', '4/17', '4/19', '4/21', '4/23'].map((label, index) => (
            <text key={label} x={36 + index * 129} y="234" textAnchor="middle" fontSize="10" fill="var(--ink-4)" fontFamily="var(--font-mono)">
              {label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}
