import type { AnalyzedMove, Color } from '../types'
import { accuracyFromWinPercentLoss } from './classification'

export type GamePhase = 'opening' | 'middlegame' | 'endgame'

const NON_PAWN_VALUES: Record<string, number> = { n: 3, b: 3, r: 5, q: 9 }

function nonPawnMaterial(fen: string): number {
  const board = fen.split(' ')[0]
  let total = 0
  for (const ch of board) {
    total += NON_PAWN_VALUES[ch.toLowerCase()] ?? 0
  }
  return total
}

/**
 * Classifies each move into opening/middlegame/endgame. Opening runs through
 * the last book-tagged move (at least 10, at most 20 plies — a named line
 * rarely says anything useful about "opening skill" past that). Endgame
 * starts once combined non-pawn material on the board drops to roughly half
 * of the starting total (50) — a common, simple phase heuristic, not a
 * precise theoretical definition.
 */
export function classifyPhases(moves: AnalyzedMove[]): GamePhase[] {
  let openingEnd = 0
  for (let i = 0; i < moves.length; i++) {
    if (moves[i].classification === 'book') openingEnd = i + 1
  }
  openingEnd = Math.min(Math.max(openingEnd, Math.min(10, moves.length)), 20, moves.length)

  const ENDGAME_THRESHOLD = 26
  let endgameStart = moves.length
  for (let i = openingEnd; i < moves.length; i++) {
    if (nonPawnMaterial(moves[i].fenAfter) <= ENDGAME_THRESHOLD) {
      endgameStart = i
      break
    }
  }

  return moves.map((_, i) => (i < openingEnd ? 'opening' : i < endgameStart ? 'middlegame' : 'endgame'))
}

export interface GameRating {
  opening: number | null
  middlegame: number | null
  endgame: number | null
  overall: number
  estimatedRating: number
}

function avgAccuracy(moves: AnalyzedMove[]): number | null {
  if (moves.length === 0) return null
  return moves.reduce((sum, m) => sum + accuracyFromWinPercentLoss(m.winPercentLoss), 0) / moves.length
}

// Rough accuracy% -> Elo interpolation, purely to give a ballpark "what level
// did this game look like" figure. Chess.com's own "Spielbewertung" formula
// is undisclosed; this is a documented approximation, not a copy of it.
const RATING_CURVE: [accuracy: number, rating: number][] = [
  [30, 300],
  [40, 500],
  [50, 700],
  [60, 950],
  [70, 1250],
  [80, 1550],
  [85, 1750],
  [90, 2000],
  [93, 2200],
  [96, 2450],
  [98, 2700],
  [100, 3000],
]

function estimateRating(accuracy: number): number {
  if (accuracy <= RATING_CURVE[0][0]) return RATING_CURVE[0][1]
  for (let i = 1; i < RATING_CURVE.length; i++) {
    const [accHi, ratingHi] = RATING_CURVE[i]
    const [accLo, ratingLo] = RATING_CURVE[i - 1]
    if (accuracy <= accHi) {
      const t = (accuracy - accLo) / (accHi - accLo)
      return Math.round(ratingLo + t * (ratingHi - ratingLo))
    }
  }
  return RATING_CURVE[RATING_CURVE.length - 1][1]
}

export function computeGameRating(moves: AnalyzedMove[], color: Color): GameRating {
  const phases = classifyPhases(moves)
  const own = moves.filter((m) => m.color === color)
  const ownWithPhase = moves.map((m, i) => ({ m, phase: phases[i] })).filter((x) => x.m.color === color)
  const overall = avgAccuracy(own) ?? 100
  return {
    opening: avgAccuracy(ownWithPhase.filter((x) => x.phase === 'opening').map((x) => x.m)),
    middlegame: avgAccuracy(ownWithPhase.filter((x) => x.phase === 'middlegame').map((x) => x.m)),
    endgame: avgAccuracy(ownWithPhase.filter((x) => x.phase === 'endgame').map((x) => x.m)),
    overall,
    estimatedRating: estimateRating(overall),
  }
}
