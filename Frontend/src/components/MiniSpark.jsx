import { areaPath, linePath } from '../utils/chartPaths'

export default function MiniSpark({ points, color = 'var(--indigo)', width = 140, height = 22, className = 'mt-1 block h-[22px] w-full' }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className}>
      <path d={areaPath(points, width, height)} fill={color} fillOpacity="0.12" />
      <path d={linePath(points, width, height)} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}
