import clsx from 'clsx'
import { CLASSIFICATION_META } from '../chess/classificationMeta'
import type { AnalyzedMove } from '../types'

interface Row {
  num: number
  white?: AnalyzedMove
  black?: AnalyzedMove
}

function buildRows(moves: AnalyzedMove[]): Row[] {
  const rows: Row[] = []
  for (const m of moves) {
    const num = Math.floor(m.ply / 2) + 1
    let row = rows[rows.length - 1]
    if (!row || row.num !== num) {
      row = { num }
      rows.push(row)
    }
    if (m.color === 'w') row.white = m
    else row.black = m
  }
  return rows
}

function MoveCell({
  move,
  currentPly,
  onSelect,
}: {
  move?: AnalyzedMove
  currentPly: number
  onSelect: (ply: number) => void
}) {
  if (!move) return <span />
  const meta = CLASSIFICATION_META[move.classification]
  const active = move.ply === currentPly
  return (
    <button
      onClick={() => onSelect(move.ply)}
      className={clsx(
        'flex items-center gap-1 rounded px-1.5 py-0.5 text-left text-sm hover:bg-white/5',
        active && 'bg-(--color-bg-panel) ring-1 ring-(--color-accent)',
      )}
    >
      <span>{move.san}</span>
      <span className="text-xs" style={{ color: meta.color }} title={meta.label}>
        {meta.glyph}
      </span>
      {move.brilliantAvailable && move.classification !== 'brilliant' && (
        <span className="text-xs" title="Ein brillanter Zug war hier möglich">
          ✨
        </span>
      )}
    </button>
  )
}

export default function MoveList({
  moves,
  currentPly,
  onSelect,
}: {
  moves: AnalyzedMove[]
  currentPly: number
  onSelect: (ply: number) => void
}) {
  const rows = buildRows(moves)
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      {rows.map((row) => (
        <div key={row.num} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-1">
          <span className="text-(--color-text-muted)">{row.num}.</span>
          <MoveCell move={row.white} currentPly={currentPly} onSelect={onSelect} />
          <MoveCell move={row.black} currentPly={currentPly} onSelect={onSelect} />
        </div>
      ))}
    </div>
  )
}
