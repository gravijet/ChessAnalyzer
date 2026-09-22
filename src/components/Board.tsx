import { useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import type { Arrow } from 'react-chessboard'
import { BOARD_THEMES } from '../chess/boardThemes'
import { buildPieceSet } from '../chess/pieceSets'
import type { BoardThemeId, PieceSetId } from '../types'

export interface BoardArrow {
  from: string
  to: string
  color?: string
}

export interface BoardProps {
  fen: string
  orientation?: 'white' | 'black'
  boardTheme?: BoardThemeId
  pieceSet?: PieceSetId
  arrows?: BoardArrow[]
  highlightSquares?: Record<string, string>
  onPieceDrop?: (from: string, to: string, promotion?: string) => boolean
  onSquareClick?: (square: string) => void
  allowDragging?: boolean
}

export default function Board({
  fen,
  orientation = 'white',
  boardTheme = 'green',
  pieceSet = 'neo',
  arrows = [],
  highlightSquares = {},
  onPieceDrop,
  onSquareClick,
  allowDragging = true,
}: BoardProps) {
  const pieces = useMemo(() => buildPieceSet(pieceSet), [pieceSet])
  const theme = BOARD_THEMES[boardTheme]

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {}
    for (const [square, color] of Object.entries(highlightSquares)) {
      styles[square] = { backgroundColor: color }
    }
    return styles
  }, [highlightSquares])

  const boardArrows: Arrow[] = useMemo(
    () => arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color ?? '#f2a900' })),
    [arrows],
  )

  return (
    <Chessboard
      options={{
        position: fen,
        boardOrientation: orientation,
        pieces,
        lightSquareStyle: { backgroundColor: theme.light },
        darkSquareStyle: { backgroundColor: theme.dark },
        squareStyles,
        arrows: boardArrows,
        allowDragging,
        allowDrawingArrows: false,
        animationDurationInMs: 150,
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          if (!onPieceDrop || !targetSquare) return false
          return onPieceDrop(sourceSquare, targetSquare, 'q')
        },
        onSquareClick: onSquareClick ? ({ square }) => onSquareClick(square) : undefined,
      }}
    />
  )
}
