export function linePath(points, width, height, pad = 2) {
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = max - min || 1
  const step = (width - pad * 2) / (points.length - 1)

  return points
    .map((point, index) => {
      const x = pad + index * step
      const y = height - pad - ((point - min) / range) * (height - pad * 2)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export function areaPath(points, width, height, pad = 2) {
  return `${linePath(points, width, height, pad)} L ${width - pad} ${height} L ${pad} ${height} Z`
}

export function providerGradient(provider) {
  if (provider === 'Gemini') return 'linear-gradient(135deg, oklch(0.6 0.14 265), oklch(0.55 0.14 275))'
  if (provider === 'Groq') return 'linear-gradient(135deg, oklch(0.6 0.14 300), oklch(0.55 0.14 310))'
  if (provider === 'OpenAI') return 'linear-gradient(135deg, oklch(0.6 0.12 155), oklch(0.55 0.12 165))'
  return 'linear-gradient(135deg, oklch(0.6 0.14 45), oklch(0.55 0.14 55))'
}
