import { winPercentForWhite } from '../chess/classification'
import type { Eval } from '../types'

function formatEval(e: Eval): string {
  if (e.type === 'mate') return `M${Math.abs(e.value)}`
  const pawns = e.value / 100
  return (pawns > 0 ? '+' : '') + pawns.toFixed(1)
}

export default function EvalBar({
  evaluation,
  orientation = 'white',
}: {
  evaluation: Eval
  orientation?: 'white' | 'black'
}) {
  const whitePct = Math.max(2, Math.min(98, winPercentForWhite(evaluation)))
  const whiteAtBottom = orientation === 'white'

  return (
    <div className="relative flex h-full w-7 flex-col overflow-hidden rounded-md bg-[#3b3b39]">
      <div
        className="absolute inset-x-0 bg-[#f1f1ef] transition-[height] duration-300 ease-out"
        style={whiteAtBottom ? { bottom: 0, height: `${whitePct}%` } : { top: 0, height: `${100 - whitePct}%` }}
      />
      <span className="relative z-10 mt-auto px-0.5 pb-1 text-center text-[10px] font-semibold text-(--color-text)">
        {formatEval(evaluation)}
      </span>
    </div>
  )
}
