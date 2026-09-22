import type { PieceRenderObject } from 'react-chessboard'
import type { PieceSetId } from '../types'

export const PIECE_SETS: PieceSetId[] = ['neo', 'wood', 'glass']

const PIECE_KEYS = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'] as const

export function buildPieceSet(theme: PieceSetId): PieceRenderObject {
  const set = {} as PieceRenderObject
  for (const key of PIECE_KEYS) {
    const file = key.toLowerCase()
    set[key] = () => (
      <img
        src={`/pieces/${theme}/${file}.png`}
        alt={key}
        draggable={false}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      />
    )
  }
  return set
}
