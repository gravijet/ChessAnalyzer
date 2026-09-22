import { winPercentForWhite } from '../chess/classification'
import { CLASSIFICATION_META } from '../chess/classificationMeta'
import type { AnalyzedMove } from '../types'

const WIDTH = 600
const HEIGHT = 90

export default function EvalGraph({
  moves,
  currentPly,
  onSelect,
}: {
  moves: AnalyzedMove[]
  currentPly: number
  onSelect: (ply: number) => void
}) {
  if (moves.length === 0) return null

  const points = moves.map((m, i) => {
    const x = (i / Math.max(1, moves.length - 1)) * WIDTH
    const y = HEIGHT - (winPercentForWhite(m.evalAfterPlayed) / 100) * HEIGHT
    return { x, y, m }
  })
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${path} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-20 w-full cursor-pointer"
      preserveAspectRatio="none"
      role="img"
      aria-label="Bewertungsverlauf"
    >
      <rect x={0} y={0} width={WIDTH} height={HEIGHT / 2} fill="#2b3230" />
      <rect x={0} y={HEIGHT / 2} width={WIDTH} height={HEIGHT / 2} fill="#0a0c0b" />
      <path d={areaPath} fill="#f1f1ef" opacity={0.85} />
      <line x1={0} y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} stroke="#000" strokeOpacity={0.3} strokeWidth={1} />
      {points.map((p, i) => (
        <circle
          key={p.m.ply}
          cx={p.x}
          cy={p.y}
          r={i === currentPly ? 4.5 : 2.5}
          fill={CLASSIFICATION_META[p.m.classification].color}
          stroke={i === currentPly ? '#fff' : 'none'}
          strokeWidth={1.5}
          onClick={() => onSelect(i)}
        />
      ))}
    </svg>
  )
}
