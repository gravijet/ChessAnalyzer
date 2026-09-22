import type { Eval } from '../types'

export interface UciInfoLine {
  depth: number
  multipv: number
  eval: Eval
  /** Principal variation, UCI moves, from the analyzed position's side to move. */
  pv: string[]
}

/**
 * Parses a raw UCI `info ...` line into a structured record. Returns null
 * for info lines that don't carry a score+pv (e.g. pure "info string" or
 * currmove progress lines).
 *
 * The returned eval's `value` is from the perspective of the side to move
 * in the analyzed position — callers normalize to White's perspective using
 * the color of that position (see `toWhitePerspective`).
 */
export function parseInfoLine(line: string): UciInfoLine | null {
  if (!line.startsWith('info ')) return null
  const tokens = line.split(' ')

  let depth: number | null = null
  let multipv = 1
  let scoreType: 'cp' | 'mate' | null = null
  let scoreValue: number | null = null
  let pv: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    switch (tokens[i]) {
      case 'depth':
        depth = Number(tokens[++i])
        break
      case 'multipv':
        multipv = Number(tokens[++i])
        break
      case 'score':
        scoreType = tokens[++i] as 'cp' | 'mate'
        scoreValue = Number(tokens[++i])
        break
      case 'pv':
        pv = tokens.slice(i + 1)
        i = tokens.length
        break
      default:
        break
    }
  }

  if (depth === null || scoreType === null || scoreValue === null || pv.length === 0) {
    return null
  }

  return {
    depth,
    multipv,
    eval: { type: scoreType, value: scoreValue },
    pv,
  }
}

export function parseBestmove(line: string): string | null {
  if (!line.startsWith('bestmove')) return null
  const tokens = line.split(' ')
  return tokens[1] ?? null
}

/**
 * UCI scores are relative to the side to move. Normalize to "positive =
 * good for White" so the rest of the app never has to think about whose
 * turn it is.
 */
export function toWhitePerspective(evaluation: Eval, sideToMove: 'w' | 'b'): Eval {
  if (sideToMove === 'w') return evaluation
  return { type: evaluation.type, value: -evaluation.value }
}
