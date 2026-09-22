import { useEffect, useRef, useState } from 'react'
import { classifyMove, tierFromLoss, verifyBrilliantCandidate } from '../chess/classification'
import { legalMoveCount } from '../chess/notation'
import type { AnalyzedMove, Color, Eval, EngineLine, EngineSettings } from '../types'
import { useStockfish } from './useStockfish'

export interface LiveBestMove {
  uci: string
  san: string
}

/**
 * Live engine assistant for free play (PlayView, and ReviewView's explore
 * mode): a permanent "best move here" hint sourced from a continuous
 * background analysis of the current position, and a `judge()` call that
 * classifies a just-played move using the exact same `classifyMove` pipeline
 * as the post-hoc game review — Brilliant detection, its explanation, and
 * (for Brilliant specifically) the same extra-depth re-verification —
 * instead of a separate, simplified live-only tiering.
 */
export function useLiveJudgment(params: { fen: string; settings: EngineSettings; active: boolean }) {
  const { fen, settings, active } = params
  const engineOpts = active ? { strength: settings.strength, threads: 1, multiPv: 3 as const } : null
  const { engine } = useStockfish(engineOpts)
  const [liveEval, setLiveEval] = useState<Eval | null>(null)
  const [bestMove, setBestMove] = useState<LiveBestMove | null>(null)
  const [lastMove, setLastMove] = useState<AnalyzedMove | null>(null)
  const [pending, setPending] = useState(false)
  // The most recent background analysis, kept as the "pre-move" reference so
  // judge() usually doesn't need to re-search the position from scratch.
  const preMoveRef = useRef<{ fen: string; lines: EngineLine[] } | null>(null)

  // Mirrors `engine` into a ref so judge() always sees the latest value. This
  // matters because judge() is typically called synchronously in the same
  // event handler that first flips `active` true — at that point `engine`
  // in this render's closure is still null (the worker hasn't been created
  // yet), so judge() must be able to wait for it via the ref instead of the
  // stale closure variable.
  const engineRef = useRef(engine)
  useEffect(() => {
    engineRef.current = engine
  }, [engine])

  useEffect(() => {
    if (!engine || !active || !fen) return
    let cancelled = false
    engine
      .analyzePosition(fen, { depth: settings.depth, multiPv: 3 })
      .then((lines) => {
        if (cancelled || lines.length === 0) return
        setLiveEval(lines[0].eval)
        setBestMove({ uci: lines[0].move, san: lines[0].san })
        preMoveRef.current = { fen, lines }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [fen, engine, active, settings.depth])

  async function judge(fenBefore: string, fenAfter: string, uci: string, san: string, color: Color): Promise<void> {
    setPending(true)
    try {
      let eng = engineRef.current
      if (!eng) {
        // The worker may still be spinning up (this call often happens in
        // the same tick that first activated it) - wait briefly rather than
        // silently giving up.
        for (let i = 0; i < 50 && !eng; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          eng = engineRef.current
        }
      }
      if (!eng) return

      let lines = preMoveRef.current?.fen === fenBefore ? preMoveRef.current.lines : null
      if (!lines) lines = await eng.analyzePosition(fenBefore, { depth: settings.depth, multiPv: 3 })

      const idxPlayed = lines.findIndex((l) => l.move === uci)
      let evalAfterPlayed = idxPlayed >= 0 ? lines[idxPlayed].eval : null
      if (evalAfterPlayed === null) {
        const followUp = await eng.analyzePosition(fenAfter, { depth: settings.depth, multiPv: 1 })
        evalAfterPlayed = followUp[0]?.eval ?? lines[0].eval
      }

      let analyzed = classifyMove(
        { ply: 0, color, fenBefore, fenAfter, san, uci, lines, evalAfterPlayed, legalMoveCount: legalMoveCount(fenBefore) },
        null,
      )

      if (analyzed.classification === 'brilliant') {
        const engForVerify = eng
        const ok = await verifyBrilliantCandidate({
          analyze: (f, o) => engForVerify.analyzePosition(f, o),
          fenBefore,
          uci,
          color,
          baseDepth: settings.depth,
        })
        if (!ok) analyzed = { ...analyzed, classification: tierFromLoss(analyzed.winPercentLoss), brilliantNote: null }
      }

      setLastMove(analyzed)
    } finally {
      setPending(false)
    }
  }

  return { liveEval, bestMove, lastMove, judge, pending }
}
