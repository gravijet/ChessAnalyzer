import { Chess, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Board, { type BoardArrow } from '../components/Board'
import { CLASSIFICATION_META } from '../chess/classificationMeta'
import ClassificationIcon from '../components/ClassificationIcon'
import EvalBar from '../components/EvalBar'
import { useLiveJudgment } from '../engine/useLiveJudgment'
import { useStockfish } from '../engine/useStockfish'
import { playSound } from '../lib/sounds'
import { useAppStore } from '../store/useAppStore'
import type { Color } from '../types'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

type Mode = 'engine' | 'free'

interface LocationState {
  fen?: string
  label?: string
}

export default function PlayView() {
  const location = useLocation()
  const navState = (location.state ?? {}) as LocationState
  const settings = useAppStore((s) => s.settings)

  const [initialFen, setInitialFen] = useState(navState.fen ?? START_FEN)
  const [mode, setMode] = useState<Mode>('engine')
  const [humanColor, setHumanColor] = useState<Color>('w')
  const [limitElo, setLimitElo] = useState<number | null>(1500)
  const [orientation, setOrientation] = useState<Color>('w')
  const [thinking, setThinking] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const chessRef = useRef(new Chess(initialFen))
  const [fen, setFen] = useState(chessRef.current.fen())
  const [sanHistory, setSanHistory] = useState<string[]>([])
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)

  useEffect(() => setOrientation(humanColor), [humanColor])

  const judgment = useLiveJudgment({ fen, settings: settings.liveEngine, active: true })

  const opponentOpts = useMemo(
    () =>
      mode === 'engine'
        ? { strength: settings.engine.strength, threads: settings.engine.threads, multiPv: 1 as const }
        : null,
    [mode, settings.engine.strength, settings.engine.threads],
  )
  const { engine: opponentEngine, loading: opponentLoading } = useStockfish(opponentOpts)
  const [opponentReady, setOpponentReady] = useState(false)

  useEffect(() => {
    if (!opponentEngine) {
      setOpponentReady(false)
      return
    }
    let cancelled = false
    setOpponentReady(false)
    opponentEngine.setStrengthLimit(limitElo).then(() => {
      if (!cancelled) setOpponentReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [opponentEngine, limitElo])

  function resetGame(fromFen: string) {
    chessRef.current = new Chess(fromFen)
    setInitialFen(fromFen)
    setFen(chessRef.current.fen())
    setSanHistory([])
    setStatusMsg(null)
    setSelectedSquare(null)
  }

  function reportGameOver() {
    const c = chessRef.current
    if (c.isCheckmate()) setStatusMsg(`Schachmatt — ${c.turn() === 'w' ? 'Schwarz' : 'Weiß'} gewinnt.`)
    else if (c.isStalemate()) setStatusMsg('Patt.')
    else if (c.isDraw()) setStatusMsg('Remis.')
    playSound('gameEnd', settings.soundEnabled)
  }

  function applyLocalMove(from: string, to: string, promotion?: string): boolean {
    const c = chessRef.current
    const fenBefore = c.fen()
    try {
      const move = c.move({ from, to, promotion })
      if (!move) return false
      const fenAfter = c.fen()
      setFen(fenAfter)
      setSanHistory((prev) => [...prev, move.san])
      playSound(move.captured ? 'capture' : move.san.includes('O-O') ? 'castle' : 'moveSelf', settings.soundEnabled)
      if (c.isCheck() && !c.isCheckmate()) playSound('moveCheck', settings.soundEnabled)
      if (c.isGameOver()) reportGameOver()
      void judgment.judge(fenBefore, fenAfter, move.lan, move.san, move.color)
      return true
    } catch {
      playSound('illegal', settings.soundEnabled)
      return false
    }
  }

  // Click-to-move: select a square with a piece, then click the target.
  function handleSquareClick(square: string) {
    if (selectedSquare) {
      const from = selectedSquare
      setSelectedSquare(null)
      if (from !== square) applyLocalMove(from, square, 'q')
      return
    }
    if (chessRef.current.get(square as Square)) setSelectedSquare(square)
  }

  // Engine opponent move.
  useEffect(() => {
    if (mode !== 'engine' || !opponentEngine || !opponentReady) return
    const c = chessRef.current
    if (c.isGameOver()) return
    if (c.turn() === humanColor) return
    setThinking(true)
    opponentEngine
      .analyzePosition(c.fen(), { movetimeMs: 900, multiPv: 1 })
      .then((lines) => {
        const best = lines[0]
        if (!best) return
        const from = best.move.slice(0, 2)
        const to = best.move.slice(2, 4)
        const promotion = best.move.length > 4 ? best.move.slice(4) : undefined
        applyLocalMove(from, to, promotion)
      })
      .finally(() => setThinking(false))
    // fen/sanHistory intentionally drive re-checks of whose turn it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, opponentEngine, opponentReady, fen, humanColor])

  function rewindTo(index: number) {
    const c = new Chess(initialFen)
    for (let i = 0; i < index; i++) c.move(sanHistory[i])
    chessRef.current = c
    setFen(c.fen())
    setSanHistory(sanHistory.slice(0, index))
    setStatusMsg(null)
    setSelectedSquare(null)
  }

  const isHumanTurn = mode === 'free' || chessRef.current.turn() === humanColor

  const arrows: BoardArrow[] = []
  if (settings.showMoveHints && isHumanTurn && !thinking && judgment.bestMove) {
    arrows.push({
      from: judgment.bestMove.uci.slice(0, 2),
      to: judgment.bestMove.uci.slice(2, 4),
      color: CLASSIFICATION_META.best.color,
    })
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 lg:flex-row">
      <div className="flex flex-1 flex-col items-center gap-2">
        {navState.label && <p className="text-sm text-(--color-text-muted)">Fortgesetzt aus: {navState.label}</p>}
        <div className="flex w-full max-w-[560px] gap-2">
          {judgment.liveEval && <EvalBar evaluation={judgment.liveEval} orientation={orientation === 'w' ? 'white' : 'black'} />}
          <div className="aspect-square w-full">
            <Board
              fen={fen}
              orientation={orientation === 'w' ? 'white' : 'black'}
              boardTheme={settings.boardTheme}
              pieceSet={settings.pieceSet}
              arrows={arrows}
              allowDragging={isHumanTurn && !thinking}
              onPieceDrop={(from, to) => applyLocalMove(from, to, 'q')}
              onSquareClick={handleSquareClick}
              highlightSquares={selectedSquare ? { [selectedSquare]: 'rgba(246, 200, 95, 0.55)' } : {}}
            />
          </div>
        </div>
        {sanHistory.length > 0 && (
          <div className="w-full max-w-[560px] text-sm text-(--color-text-muted)">
            <div className="flex items-center gap-2">
              <span className="font-medium text-(--color-text)">{sanHistory[sanHistory.length - 1]}</span>
              {judgment.pending || !judgment.lastMove || judgment.lastMove.san !== sanHistory[sanHistory.length - 1] ? (
                <span>wird bewertet…</span>
              ) : (
                <>
                  <ClassificationIcon classification={judgment.lastMove.classification} size={14} />
                  <span style={{ color: CLASSIFICATION_META[judgment.lastMove.classification].color }}>
                    {CLASSIFICATION_META[judgment.lastMove.classification].label}
                  </span>
                </>
              )}
            </div>
            {settings.showBrilliantHints &&
              judgment.lastMove?.san === sanHistory[sanHistory.length - 1] &&
              judgment.lastMove.classification === 'brilliant' &&
              judgment.lastMove.brilliantNote && (
                <p className="mt-0.5 text-xs" style={{ color: CLASSIFICATION_META.brilliant.color }}>
                  {judgment.lastMove.brilliantNote}
                </p>
              )}
          </div>
        )}
        <div className="flex w-full max-w-[560px] items-center justify-between text-sm">
          <div className="flex gap-1">
            <button onClick={() => rewindTo(0)} className="rounded px-2 py-1 hover:bg-white/10">
              ⏮
            </button>
            <button onClick={() => rewindTo(Math.max(0, sanHistory.length - 1))} className="rounded px-2 py-1 hover:bg-white/10">
              ◀
            </button>
          </div>
          <button onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} className="rounded px-2 py-1 hover:bg-white/10">
            Brett drehen
          </button>
        </div>
        {statusMsg && (
          <div className="w-full max-w-[560px] rounded-md border border-(--color-border) bg-(--color-bg-elevated) p-3 text-center text-sm font-medium">
            {statusMsg}
          </div>
        )}
        {thinking && <p className="text-xs text-(--color-text-muted)">Engine denkt…</p>}
      </div>

      <div className="flex w-full flex-col gap-3 lg:w-72">
        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
          <h3 className="mb-2 text-xs font-semibold text-(--color-text-muted) uppercase">Modus</h3>
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setMode('engine')}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm ${mode === 'engine' ? 'bg-(--color-accent) text-black' : 'border border-(--color-border)'}`}
            >
              Gegen Engine
            </button>
            <button
              onClick={() => setMode('free')}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm ${mode === 'free' ? 'bg-(--color-accent) text-black' : 'border border-(--color-border)'}`}
            >
              Freies Spiel
            </button>
          </div>
          {mode === 'engine' && (
            <>
              <label className="mb-1 block text-xs text-(--color-text-muted)">Du spielst</label>
              <div className="mb-3 flex gap-2">
                <button
                  onClick={() => setHumanColor('w')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm ${humanColor === 'w' ? 'bg-(--color-accent) text-black' : 'border border-(--color-border)'}`}
                >
                  Weiß
                </button>
                <button
                  onClick={() => setHumanColor('b')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm ${humanColor === 'b' ? 'bg-(--color-accent) text-black' : 'border border-(--color-border)'}`}
                >
                  Schwarz
                </button>
              </div>
              <label className="mb-1 flex items-center justify-between text-xs text-(--color-text-muted)">
                <span>Engine-Stärke</span>
                <span>{limitElo === null ? 'Maximal' : `${limitElo} Elo`}</span>
              </label>
              <input
                type="range"
                min={1320}
                max={3190}
                step={10}
                value={limitElo ?? 3190}
                onChange={(e) => setLimitElo(Number(e.target.value))}
                className="w-full"
              />
              <label className="mt-1 flex items-center gap-2 text-xs text-(--color-text-muted)">
                <input type="checkbox" checked={limitElo === null} onChange={(e) => setLimitElo(e.target.checked ? null : 1500)} />
                Volle Stärke (kein Limit)
              </label>
              {opponentLoading && <p className="mt-2 text-xs text-(--color-text-muted)">Engine lädt…</p>}
            </>
          )}
        </div>

        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
          <button
            onClick={() => resetGame(START_FEN)}
            className="w-full rounded-md border border-(--color-border) py-1.5 text-sm hover:bg-white/5"
          >
            Neue Partie (Startaufstellung)
          </button>
        </div>

        <div className="flex-1 overflow-y-auto rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-3">
          <h3 className="mb-2 text-xs font-semibold text-(--color-text-muted) uppercase">Züge</h3>
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
            {sanHistory.map((san, i) => (
              <button key={i} onClick={() => rewindTo(i + 1)} className="rounded px-1 hover:bg-white/10">
                {i % 2 === 0 ? `${i / 2 + 1}.` : ''} {san}
              </button>
            ))}
            {sanHistory.length === 0 && <span className="text-(--color-text-muted)">Noch keine Züge.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
