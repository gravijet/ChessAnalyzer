import { classifyGame, computeAccuracy, tierFromLoss, verifyBrilliantCandidate, type RawMoveData } from '../chess/classification'
import { legalMoveCount, terminalEval } from '../chess/notation'
import { findOpening } from '../chess/openingBook'
import { parsePgn } from '../chess/pgn'
import type { AnalysisResult, EngineSettings } from '../types'
import type { StockfishEngine } from './stockfishEngine'

export interface AnalyzeGameProgress {
  movesDone: number
  movesTotal: number
}

export function settingsHash(settings: EngineSettings): string {
  return `${settings.strength}:${settings.depth}:${settings.multiPv}:${settings.threads}`
}

export async function analyzeGame(
  gameId: string,
  pgn: string,
  engine: StockfishEngine,
  settings: EngineSettings,
  onProgress?: (progress: AnalyzeGameProgress) => void,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const { plies } = parsePgn(pgn)
  const sanHistory = plies.map((p) => p.san)
  const opening = await findOpening(sanHistory)

  const raws: RawMoveData[] = []
  for (let i = 0; i < plies.length; i++) {
    if (signal?.aborted) throw new DOMException('Analyse abgebrochen.', 'AbortError')
    const ply = plies[i]
    const lines = await engine.analyzePosition(ply.fenBefore, {
      depth: settings.depth,
      multiPv: settings.multiPv,
    })
    const idxPlayed = lines.findIndex((l) => l.move === ply.uci)

    let evalAfterPlayed = idxPlayed >= 0 ? lines[idxPlayed].eval : null
    if (evalAfterPlayed === null) {
      evalAfterPlayed = terminalEval(ply.fenAfter, ply.color)
    }
    if (evalAfterPlayed === null) {
      const followUp = await engine.analyzePosition(ply.fenAfter, {
        depth: settings.depth,
        multiPv: 1,
      })
      evalAfterPlayed = followUp[0]?.eval ?? lines[0].eval
    }

    raws.push({
      ply: ply.ply,
      color: ply.color,
      fenBefore: ply.fenBefore,
      fenAfter: ply.fenAfter,
      san: ply.san,
      uci: ply.uci,
      lines,
      evalAfterPlayed,
      legalMoveCount: legalMoveCount(ply.fenBefore),
    })
    onProgress?.({ movesDone: i + 1, movesTotal: plies.length })
  }

  const moves = classifyGame(raws, opening)

  // Brilliant is rare and high-stakes to get wrong, so every candidate gets
  // a second, deeper look before it's trusted — the main pass runs at the
  // game-review depth, which can occasionally misjudge whether a sacrifice
  // truly holds up. A rejected candidate falls back to its plain win%-loss
  // tier and loses its explanation note.
  for (let i = 0; i < moves.length; i++) {
    if (signal?.aborted) throw new DOMException('Analyse abgebrochen.', 'AbortError')
    if (moves[i].classification !== 'brilliant') continue
    const ok = await verifyBrilliantCandidate({
      analyze: (fen, opts) => engine.analyzePosition(fen, opts),
      fenBefore: raws[i].fenBefore,
      uci: raws[i].uci,
      color: raws[i].color,
      baseDepth: settings.depth,
    })
    if (!ok) {
      moves[i] = { ...moves[i], classification: tierFromLoss(moves[i].winPercentLoss), brilliantNote: null }
    }
  }

  return {
    gameId,
    settingsHash: settingsHash(settings),
    moves,
    accuracyWhite: computeAccuracy(moves, 'w'),
    accuracyBlack: computeAccuracy(moves, 'b'),
    generatedAt: new Date().toISOString(),
  }
}
