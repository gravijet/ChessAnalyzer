import { Chess, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Board, { type BoardArrow } from '../components/Board'
import ClassificationIcon from '../components/ClassificationIcon'
import EvalBar from '../components/EvalBar'
import EvalGraph from '../components/EvalGraph'
import MoveList from '../components/MoveList'
import { CLASSIFICATION_META } from '../chess/classificationMeta'
import { computeGameRating } from '../chess/gamePhase'
import { analyzeGame, settingsHash } from '../engine/analyzeGame'
import { StockfishEngine } from '../engine/stockfishEngine'
import { useLiveJudgment } from '../engine/useLiveJudgment'
import { playSound } from '../lib/sounds'
import { useAppStore } from '../store/useAppStore'
import type { AnalyzedMove, Classification, Color } from '../types'

const GOOD_TIERS: Classification[] = ['best', 'great', 'brilliant', 'book', 'forced', 'excellent']
const EMPTY_MOVES: AnalyzedMove[] = []
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function accuracyColor(pct: number): string {
  if (pct >= 90) return 'var(--color-best)'
  if (pct >= 75) return 'var(--color-good)'
  if (pct >= 55) return 'var(--color-inaccuracy)'
  return 'var(--color-blunder)'
}

export default function ReviewView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const games = useAppStore((s) => s.games)
  const analyses = useAppStore((s) => s.analyses)
  const settings = useAppStore((s) => s.settings)
  const setAnalysis = useAppStore((s) => s.setAnalysis)

  const game = useMemo(() => games.find((g) => g.id === id), [games, id])
  const analysis = id ? analyses[id] : undefined
  const stale = analysis && analysis.settingsHash !== settingsHash(settings.engine)

  const [viewIndex, setViewIndex] = useState(0)
  const [trackedId, setTrackedId] = useState(id)
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Free-play continuation from wherever the user is currently looking,
  // without needing to leave for a separate PlayView session. The Chess
  // instance is a ref (mutated only in handlers/effects, never read during
  // render); `exploreFen` mirrors its position into state so rendering never
  // touches the ref directly.
  const [exploreMoves, setExploreMoves] = useState<{ san: string; color: Color }[]>([])
  const [exploreFen, setExploreFen] = useState<string | null>(null)
  const exploreChessRef = useRef<Chess | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)

  function clearExplore() {
    exploreChessRef.current = null
    setExploreFen(null)
    setSelectedSquare(null)
    setExploreMoves((prev) => (prev.length > 0 ? [] : prev))
  }

  // Reset the move cursor (and any in-progress free-play branch) when
  // navigating to a different game, without an effect.
  if (id !== trackedId) {
    setTrackedId(id)
    setViewIndex(0)
    if (exploreMoves.length > 0 || exploreFen !== null) {
      setExploreFen(null)
      setExploreMoves([])
    }
  }
  useEffect(() => {
    exploreChessRef.current = null
  }, [id])

  function gotoViewIndex(i: number) {
    clearExplore()
    setViewIndex(i)
  }

  const judgment = useLiveJudgment({
    fen: exploreFen ?? '',
    settings: settings.liveEngine,
    active: exploreMoves.length > 0 && exploreFen !== null,
  })

  const moves = analysis?.moves ?? EMPTY_MOVES

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') setViewIndex((v) => Math.max(0, v - 1))
      else if (e.key === 'ArrowRight') setViewIndex((v) => Math.min(moves.length, v + 1))
      else return
      clearExplore()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves.length])

  const summary = useMemo(() => {
    const counts: Partial<Record<'w' | 'b', Partial<Record<Classification, number>>>> = { w: {}, b: {} }
    for (const m of moves) {
      const c = counts[m.color]!
      c[m.classification] = (c[m.classification] ?? 0) + 1
    }
    return counts
  }, [moves])

  const rating = useMemo(
    () => (moves.length > 0 ? { w: computeGameRating(moves, 'w'), b: computeGameRating(moves, 'b') } : null),
    [moves],
  )

  if (!game) {
    return (
      <div className="p-6 text-(--color-text-muted)">
        Partie nicht gefunden. <button className="underline" onClick={() => navigate('/')}>Zurück zur Bibliothek</button>
      </div>
    )
  }
  const activeGame = game

  // `annotatedMove` describes the move whose RESULT is currently on the
  // board — i.e. the move that was just played, not the one about to be
  // played. viewIndex counts "how many moves have been played" (0 = the
  // true starting position, nothing to show a badge for yet), so it maps to
  // moves[viewIndex - 1], not moves[viewIndex]. Showing the classification
  // badge for a move before that move visibly happens on the board was
  // exactly the confusing-timing bug this fixes.
  const annotatedMove: AnalyzedMove | undefined = viewIndex > 0 ? moves[viewIndex - 1] : undefined
  const exploring = exploreMoves.length > 0
  const analyzedDisplayFen = annotatedMove ? annotatedMove.fenAfter : (moves[0]?.fenBefore ?? START_FEN)
  const displayFen = exploring && exploreFen ? exploreFen : analyzedDisplayFen

  const arrows: BoardArrow[] = []
  if (exploring) {
    // Free play: always show the engine's current best-move hint (unless
    // disabled in settings), never the move just played (that's shown as a
    // text judgement instead, below).
    if (settings.showMoveHints && judgment.bestMove) {
      arrows.push({
        from: judgment.bestMove.uci.slice(0, 2),
        to: judgment.bestMove.uci.slice(2, 4),
        color: CLASSIFICATION_META.best.color,
      })
    }
  } else if (annotatedMove) {
    const bestFrom = annotatedMove.bestMoveUci.slice(0, 2)
    const bestTo = annotatedMove.bestMoveUci.slice(2, 4)
    const isBrilliantSuggestion = annotatedMove.brilliantAvailable && annotatedMove.classification !== 'brilliant'
    arrows.push({
      from: bestFrom,
      to: bestTo,
      color: isBrilliantSuggestion ? CLASSIFICATION_META.brilliant.color : CLASSIFICATION_META.best.color,
    })
    if (annotatedMove.uci !== annotatedMove.bestMoveUci) {
      arrows.push({
        from: annotatedMove.uci.slice(0, 2),
        to: annotatedMove.uci.slice(2, 4),
        color: CLASSIFICATION_META[annotatedMove.classification].color,
      })
    }
  }

  function handleBoardDrop(from: string, to: string, promotion = 'q'): boolean {
    const baseFen = exploreChessRef.current ? exploreChessRef.current.fen() : displayFen
    const chess = exploreChessRef.current ?? new Chess(baseFen)
    let move
    try {
      move = chess.move({ from, to, promotion })
    } catch {
      move = null
    }
    if (!move) {
      playSound('illegal', settings.soundEnabled)
      return false
    }
    exploreChessRef.current = chess
    playSound(move.captured ? 'capture' : move.san.includes('O-O') ? 'castle' : 'moveSelf', settings.soundEnabled)
    if (chess.isCheck() && !chess.isCheckmate()) playSound('moveCheck', settings.soundEnabled)
    if (chess.isGameOver()) playSound('gameEnd', settings.soundEnabled)
    const newFen = chess.fen()
    setExploreFen(newFen)
    setExploreMoves((prev) => [...prev, { san: move.san, color: move.color }])
    void judgment.judge(baseFen, newFen, move.lan, move.san, move.color)
    return true
  }

  // Click-to-move: an alternative to dragging (more reliable on trackpads/
  // touch). Click a square with a piece to select it, then click the target.
  function handleSquareClick(square: string) {
    if (selectedSquare) {
      const from = selectedSquare
      setSelectedSquare(null)
      if (from !== square) handleBoardDrop(from, square)
      return
    }
    if (new Chess(displayFen).get(square as Square)) setSelectedSquare(square)
  }

  async function runAnalysis() {
    if (!game) return
    setAnalyzing(true)
    setAnalyzeError(null)
    setProgress(null)
    const controller = new AbortController()
    abortRef.current = controller
    let engine: StockfishEngine | null = null
    try {
      engine = await StockfishEngine.create({
        strength: settings.engine.strength,
        threads: settings.engine.threads,
        multiPv: settings.engine.multiPv,
      })
      const result = await analyzeGame(
        game.id,
        game.pgn,
        engine,
        settings.engine,
        (p) => setProgress({ done: p.movesDone, total: p.movesTotal }),
        controller.signal,
      )
      await setAnalysis(result)
      setViewIndex(0)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setAnalyzeError(err instanceof Error ? err.message : 'Analyse fehlgeschlagen.')
      }
    } finally {
      engine?.terminate()
      abortRef.current = null
      setAnalyzing(false)
      setProgress(null)
    }
  }

  function cancelAnalysis() {
    abortRef.current?.abort()
  }

  function playFromHere() {
    navigate('/play', { state: { fen: displayFen, label: `${activeGame.white} vs ${activeGame.black}` } })
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 lg:flex-row">
      <div className="flex flex-1 flex-col items-center gap-2">
        <div className="mb-1 text-center text-sm text-(--color-text-muted)">
          <span className="font-medium text-(--color-text)">{game.white}</span>
          {game.whiteRating ? ` (${game.whiteRating})` : ''} vs{' '}
          <span className="font-medium text-(--color-text)">{game.black}</span>
          {game.blackRating ? ` (${game.blackRating})` : ''}
          {game.openingName && <span> · {game.openingName}</span>}
        </div>
        <div className="flex w-full max-w-[560px] gap-2">
          {(exploring ? judgment.liveEval : (annotatedMove?.evalAfterPlayed ?? moves[0]?.evalBefore)) && (
            <EvalBar
              evaluation={(exploring ? judgment.liveEval : (annotatedMove?.evalAfterPlayed ?? moves[0]?.evalBefore))!}
              orientation={orientation}
            />
          )}
          <div className="aspect-square w-full">
            <Board
              fen={displayFen}
              orientation={orientation}
              boardTheme={settings.boardTheme}
              pieceSet={settings.pieceSet}
              arrows={arrows}
              allowDragging={true}
              onPieceDrop={handleBoardDrop}
              onSquareClick={handleSquareClick}
              highlightSquares={selectedSquare ? { [selectedSquare]: 'rgba(246, 200, 95, 0.55)' } : {}}
            />
          </div>
        </div>

        <div className="flex w-full max-w-[560px] items-center justify-between gap-2">
          <div className="flex gap-1">
            <button onClick={() => gotoViewIndex(0)} className="rounded px-2 py-1 text-sm hover:bg-white/10">
              ⏮
            </button>
            <button
              onClick={() => gotoViewIndex(Math.max(0, viewIndex - 1))}
              className="rounded px-2 py-1 text-sm hover:bg-white/10"
            >
              ◀
            </button>
            <button
              onClick={() => gotoViewIndex(Math.min(moves.length, viewIndex + 1))}
              className="rounded px-2 py-1 text-sm hover:bg-white/10"
            >
              ▶
            </button>
            <button
              onClick={() => gotoViewIndex(moves.length)}
              className="rounded px-2 py-1 text-sm hover:bg-white/10"
            >
              ⏭
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              className="rounded px-2 py-1 text-sm hover:bg-white/10"
            >
              Brett drehen
            </button>
            {analysis && (
              <button
                onClick={playFromHere}
                className="rounded-md bg-(--color-accent) px-3 py-1 text-sm font-medium text-black"
              >
                Ab hier weiterspielen
              </button>
            )}
          </div>
        </div>

        {exploring ? (
          <div className="w-full max-w-[560px] rounded-md border border-(--color-border) bg-(--color-bg-elevated) p-3 text-sm">
            {judgment.pending || !judgment.lastMove || judgment.lastMove.san !== exploreMoves[exploreMoves.length - 1]?.san ? (
              <div className="flex items-center gap-2">
                <span className="font-medium">{exploreMoves[exploreMoves.length - 1].san}</span>
                <span className="text-(--color-text-muted)">wird bewertet…</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <ClassificationIcon classification={judgment.lastMove.classification} />
                  <span className="font-medium">{judgment.lastMove.san}</span>
                  <span style={{ color: CLASSIFICATION_META[judgment.lastMove.classification].color }}>
                    {CLASSIFICATION_META[judgment.lastMove.classification].label}
                  </span>
                </div>
                {judgment.lastMove.uci !== judgment.lastMove.bestMoveUci && !GOOD_TIERS.includes(judgment.lastMove.classification) && (
                  <p className="mt-1 text-(--color-text-muted)">
                    Besser war <span className="font-medium text-(--color-text)">{judgment.lastMove.bestMoveSan}</span>.
                  </p>
                )}
                {settings.showBrilliantHints && judgment.lastMove.classification === 'brilliant' && judgment.lastMove.brilliantNote && (
                  <p className="mt-1" style={{ color: CLASSIFICATION_META.brilliant.color }}>
                    {judgment.lastMove.brilliantNote}
                  </p>
                )}
                {settings.showBrilliantHints &&
                  judgment.lastMove.brilliantAvailable &&
                  judgment.lastMove.classification !== 'brilliant' && (
                    <p className="mt-1" style={{ color: CLASSIFICATION_META.brilliant.color }}>
                      ✨ Hier wäre der brillante Zug {judgment.lastMove.bestMoveSan} möglich gewesen!
                      {judgment.lastMove.brilliantNote && ` ${judgment.lastMove.brilliantNote}`}
                    </p>
                  )}
              </>
            )}
            <p className="mt-2 text-xs text-(--color-text-muted)">
              Freies Weiterspielen{settings.showMoveHints && ' — der Pfeil zeigt immer den aktuell besten Zug'}.
              {exploreMoves.length > 1 && ` Züge: ${exploreMoves.map((m) => m.san).join(' ')}`}
            </p>
            <button onClick={clearExplore} className="mt-2 text-xs text-(--color-text-muted) underline">
              Zurück zur Analyse
            </button>
          </div>
        ) : (
          annotatedMove && (
            <div className="w-full max-w-[560px] rounded-md border border-(--color-border) bg-(--color-bg-elevated) p-3 text-sm">
              <div className="flex items-center gap-2">
                <ClassificationIcon classification={annotatedMove.classification} />
                <span className="font-medium">{annotatedMove.san}</span>
                <span style={{ color: CLASSIFICATION_META[annotatedMove.classification].color }}>
                  {CLASSIFICATION_META[annotatedMove.classification].label}
                </span>
              </div>
              {annotatedMove.uci !== annotatedMove.bestMoveUci && !GOOD_TIERS.includes(annotatedMove.classification) && (
                <p className="mt-1 text-(--color-text-muted)">
                  Besser war <span className="font-medium text-(--color-text)">{annotatedMove.bestMoveSan}</span>.
                </p>
              )}
              {annotatedMove.classification === 'brilliant' && annotatedMove.brilliantNote && (
                <p className="mt-1" style={{ color: CLASSIFICATION_META.brilliant.color }}>
                  {annotatedMove.brilliantNote}
                </p>
              )}
              {annotatedMove.brilliantAvailable && annotatedMove.classification !== 'brilliant' && (
                <p className="mt-1" style={{ color: CLASSIFICATION_META.brilliant.color }}>
                  ✨ Hier wäre der brillante Zug {annotatedMove.bestMoveSan} möglich gewesen!
                  {annotatedMove.brilliantNote && ` ${annotatedMove.brilliantNote}`}
                </p>
              )}
            </div>
          )
        )}

        {analysis && <EvalGraph moves={moves} currentPly={viewIndex - 1} onSelect={(ply) => gotoViewIndex(ply + 1)} />}
      </div>

      <div className="flex w-full flex-col gap-3 lg:w-80">
        {!analysis || stale ? (
          <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
            {stale && <p className="mb-2 text-xs text-(--color-inaccuracy)">Engine-Einstellungen geändert — bestehende Analyse ist veraltet.</p>}
            {!analyzing ? (
              <button
                onClick={runAnalysis}
                className="w-full rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-black"
              >
                Partie analysieren ({settings.engine.strength === 'full' ? 'volle Stärke' : 'schnell'})
              </button>
            ) : (
              <div>
                <p className="mb-2 text-sm text-(--color-text-muted)">
                  Analysiere… {progress ? `${progress.done} / ${progress.total}` : ''}
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--color-bg)">
                  <div
                    className="h-full bg-(--color-accent) transition-all"
                    style={{ width: progress ? `${(100 * progress.done) / progress.total}%` : '5%' }}
                  />
                </div>
                <button onClick={cancelAnalysis} className="mt-2 text-xs text-(--color-text-muted) underline">
                  Abbrechen
                </button>
              </div>
            )}
            {analyzeError && <p className="mt-2 text-sm text-(--color-blunder)">{analyzeError}</p>}
          </div>
        ) : (
          <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>Genauigkeit</span>
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Weiß</span>
              <span className="font-semibold" style={{ color: accuracyColor(analysis.accuracyWhite) }}>
                {analysis.accuracyWhite.toFixed(1)}%
              </span>
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Schwarz</span>
              <span className="font-semibold" style={{ color: accuracyColor(analysis.accuracyBlack) }}>
                {analysis.accuracyBlack.toFixed(1)}%
              </span>
            </div>
            <button onClick={runAnalysis} className="w-full rounded-md border border-(--color-border) py-1.5 text-xs hover:bg-white/5">
              Neu analysieren
            </button>
          </div>
        )}

        {analysis && rating && (
          <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-3">
            <h3 className="mb-2 text-xs font-semibold text-(--color-text-muted) uppercase">Spielbewertung</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {(['w', 'b'] as const).map((c) => (
                <div key={c}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">{c === 'w' ? 'Weiß' : 'Schwarz'}</span>
                    <span className="font-semibold" style={{ color: accuracyColor(rating[c].overall) }}>
                      ~{rating[c].estimatedRating}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-(--color-text-muted)">
                    <div className="flex justify-between">
                      <span>Eröffnung</span>
                      <span>{rating[c].opening !== null ? `${rating[c].opening!.toFixed(0)}%` : '–'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mittelspiel</span>
                      <span>{rating[c].middlegame !== null ? `${rating[c].middlegame!.toFixed(0)}%` : '–'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Endspiel</span>
                      <span>{rating[c].endgame !== null ? `${rating[c].endgame!.toFixed(0)}%` : '–'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-(--color-text-muted)">Geschätztes Niveau anhand der Genauigkeit — grobe Näherung, keine offizielle Elo.</p>
          </div>
        )}

        {analysis && (
          <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-3">
            <h3 className="mb-2 text-xs font-semibold text-(--color-text-muted) uppercase">Zugqualität</h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {(Object.keys(CLASSIFICATION_META) as Classification[]).map((c) => {
                const w = summary.w?.[c] ?? 0
                const b = summary.b?.[c] ?? 0
                if (w === 0 && b === 0) return null
                return (
                  <div key={c} className="col-span-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5" style={{ color: CLASSIFICATION_META[c].color }}>
                      <ClassificationIcon classification={c} size={14} /> {CLASSIFICATION_META[c].label}
                    </span>
                    <span className="text-(--color-text-muted)">
                      {w} / {b}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-3">
          <h3 className="mb-2 text-xs font-semibold text-(--color-text-muted) uppercase">Züge</h3>
          {analysis ? (
            <MoveList moves={moves} currentPly={viewIndex - 1} onSelect={(ply) => gotoViewIndex(ply + 1)} />
          ) : (
            <p className="text-sm text-(--color-text-muted)">Noch keine Analyse.</p>
          )}
        </div>
      </div>
    </div>
  )
}
