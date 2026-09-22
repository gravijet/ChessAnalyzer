import { Chess } from 'chess.js'
import type { Color, Eval } from '../types'

/** Converts a UCI move (e.g. "e2e4", "e7e8q") played from `fen` into SAN. */
export function uciToSan(fen: string, uci: string): string {
  const chess = new Chess(fen)
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  const promotion = uci.length > 4 ? uci.slice(4) : undefined
  const move = chess.move({ from, to, promotion })
  return move.san
}

export function sideToMoveOf(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}

/** Applies a UCI move (e.g. "e2e4", "e7e8q") to `fen` and returns the resulting FEN. */
export function applyUciMove(fen: string, uci: string): string {
  const chess = new Chess(fen)
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  const promotion = uci.length > 4 ? uci.slice(4) : undefined
  chess.move({ from, to, promotion })
  return chess.fen()
}

export function legalMoveCount(fen: string): number {
  return new Chess(fen).moves().length
}

/**
 * Eval for a terminal position, so callers don't ask the engine to analyze
 * a checkmated/stalemated position (which has no legal moves to search).
 */
export function terminalEval(fen: string, moverColor: Color): Eval | null {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return { type: 'mate', value: moverColor === 'w' ? 1 : -1 }
  if (chess.isDraw() || chess.isStalemate()) return { type: 'cp', value: 0 }
  return null
}
