import { Chess } from 'chess.js'
import type { AnalyzedMove, Classification, Color, Eval, EngineLine } from '../types'
import type { OpeningMatch } from './openingBook'

export function winPercentForWhite(evaluation: Eval): number {
  if (evaluation.type === 'mate') {
    if (evaluation.value === 0) return 50
    return evaluation.value > 0 ? 100 : 0
  }
  // Standard cp -> win% logistic mapping (same curve Lichess uses).
  const cp = Math.max(-1000, Math.min(1000, evaluation.value))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

export function winPercentForColor(evaluation: Eval, color: Color): number {
  const white = winPercentForWhite(evaluation)
  return color === 'w' ? white : 100 - white
}

/** Lichess's published win%-loss -> per-move accuracy curve. */
export function accuracyFromWinPercentLoss(loss: number): number {
  const acc = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669
  return Math.max(0, Math.min(100, acc))
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

function materialDiffForColor(fen: string, color: Color): number {
  const board = fen.split(' ')[0]
  let white = 0
  let black = 0
  for (const ch of board) {
    const lower = ch.toLowerCase()
    const value = PIECE_VALUES[lower]
    if (value === undefined) continue
    if (ch === lower) black += value
    else white += value
  }
  return color === 'w' ? white - black : black - white
}

// Win%-loss cutoffs for inaccuracy/mistake/blunder follow Lichess's published
// annotation thresholds (10/20/30) rather than tighter homegrown numbers —
// the tighter version was flagging plenty of merely-imprecise moves as
// "Fehler"/"Patzer".
export function tierFromLoss(loss: number): Classification {
  if (loss <= 4) return 'excellent'
  if (loss <= 10) return 'good'
  if (loss <= 20) return 'inaccuracy'
  if (loss <= 30) return 'mistake'
  return 'blunder'
}

/** "Great": the engine's clear-best move, with a wide margin over the 2nd-best — a narrow save/only good move. */
function isGreatCandidate(lines: EngineLine[], color: Color): boolean {
  if (lines.length < 2) return false
  const win0 = winPercentForColor(lines[0].eval, color)
  const win1 = winPercentForColor(lines[1].eval, color)
  return win0 - win1 >= 10
}

/**
 * Engine PVs for genuine long combinations regularly run 10+ moves before
 * material fully settles (user feedback: "es gibt ja auch trades die 10
 * oder mehr züge lang gehen") - so the lookahead window needs to reach as
 * far into the PV as the engine actually gives us, not stop early. Capped
 * only as a sanity bound; chess.js move application is cheap enough that
 * walking the whole thing costs nothing.
 */
const MAX_LOOKAHEAD_PLIES = 40

/**
 * Walks a line's own expected continuation (its PV) up to `MAX_LOOKAHEAD_PLIES`
 * deep and returns the NET material change still standing once that window
 * closes, relative to `fenBefore`, from the mover's point of view (negative
 * = mover ends up down material, positive = mover ends up up material).
 * Also reports `immediateChange` - the swing after just the first ply (the
 * judged move in isolation) - so callers can tell a slow-building
 * combination apart from a simple, obvious capture.
 *
 * Measuring material at the END of a long window, rather than at any
 * intermediate low (or high) point, is what actually distinguishes a real
 * sacrifice/combination from a plain trade.
 *
 * History: the original version tracked the *peak* deficit reached
 * mid-sequence, which misclassified essentially every ordinary trade as a
 * "sacrifice" (offer a piece, opponent takes it, mover recaptures for equal
 * value two plies later - peak-tracking only ever saw the intermediate low
 * point, never the recapture that immediately followed). Fixed by switching
 * to a net-at-the-end measure, first with a 6-ply window - which was itself
 * still too shallow for combinations/trades that take longer than 3 full
 * moves to resolve, so this widens it to effectively "as far as the
 * engine's own PV goes."
 */
function materialSwingAlongPv(
  fenBefore: string,
  pv: string[],
  color: Color,
): { netChange: number; immediateChange: number; fenAtEnd: string } {
  const baseline = materialDiffForColor(fenBefore, color)
  const chess = new Chess(fenBefore)
  const lookaheadPlies = Math.min(MAX_LOOKAHEAD_PLIES, pv.length)
  let fenAfterFirstPly = fenBefore
  let fenAtEnd = fenBefore
  for (let i = 0; i < lookaheadPlies; i++) {
    const uci = pv[i]
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : undefined })
    } catch {
      break
    }
    fenAtEnd = chess.fen()
    if (i === 0) fenAfterFirstPly = fenAtEnd
  }
  return {
    netChange: materialDiffForColor(fenAtEnd, color) - baseline,
    immediateChange: materialDiffForColor(fenAfterFirstPly, color) - baseline,
    fenAtEnd,
  }
}

function opponentColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

const PIECE_NAMES_DE: Record<string, string> = {
  p: 'einen Bauern',
  n: 'einen Springer',
  b: 'einen Läufer',
  r: 'einen Turm',
  q: 'die Dame',
}

function pieceCounts(fen: string, color: Color): Record<string, number> {
  const board = fen.split(' ')[0]
  const counts: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 }
  for (const ch of board) {
    const lower = ch.toLowerCase()
    if (!(lower in counts)) continue
    const isOwn = color === 'w' ? ch === ch.toUpperCase() : ch === ch.toLowerCase()
    if (isOwn) counts[lower]++
  }
  return counts
}

/** Which of the mover's own piece types net decreased between two FENs, highest value first. */
function droppedPieceTypes(fenBefore: string, fenAfter: string, color: Color): string[] {
  const before = pieceCounts(fenBefore, color)
  const after = pieceCounts(fenAfter, color)
  return ['q', 'r', 'b', 'n', 'p'].filter((t) => after[t] < before[t])
}

/** "+2.3" / "-0.7" / "Matt in 4" / "wird in 3 matt gesetzt", from `color`'s point of view. */
export function formatEvalForColor(evaluation: Eval, color: Color): string {
  if (evaluation.type === 'mate') {
    const n = Math.abs(evaluation.value)
    const winning = (evaluation.value > 0) === (color === 'w')
    return winning ? `Matt in ${n}` : `wird in ${n} matt gesetzt`
  }
  const cp = color === 'w' ? evaluation.value : -evaluation.value
  const pawns = (cp / 100).toFixed(1)
  return cp >= 0 ? `+${pawns}` : pawns
}

type BrilliantReason =
  | { kind: 'sacrifice'; fenAtEnd: string }
  | { kind: 'mate'; movesToMate: number }
  | { kind: 'materialWin'; fenAtEnd: string }

/**
 * "Brilliant" isn't only "gives up material and is still fine" - chess.com
 * also awards it for a hard-to-see forced mate or a combination that *wins*
 * material through a delayed, non-obvious mechanism, not just for
 * sacrifices (user feedback: "die brillianten heißen nicht unbedingt dass
 * man was verliert sondern vielleicht auch gewinnt. oder schachmatt
 * macht."). No engine has a public spec for this category — this is a
 * deliberately conservative reimplementation, not a copy of anyone's
 * proprietary formula. Three independent paths, any one of which qualifies
 * a (near-)best, non-forced move:
 *
 * 1. Sacrifice: material stays down net (>=3, a minor piece or more) once
 *    the PV's forcing sequence fully resolves. (Not the *peak* deficit
 *    reached mid-sequence — see `materialSwingAlongPv`'s history note for
 *    why that distinction matters; an ordinary trade also dips mid-sequence
 *    but nets back to ~0.)
 * 2. Mate: the line forces checkmate, and it isn't simply "deliver the
 *    mate-in-1 that was already sitting on the board" (mate-in-1 is never
 *    hard to find, so it doesn't earn the label on its own).
 * 3. Material win: the mover ends up decisively ahead on material (>=5, a
 *    rook or more) net, AND most of that gain arrives on plies *after* the
 *    judged move rather than on the move itself — i.e. it's a delayed
 *    payoff from a combination, not just capturing an already-hanging
 *    piece outright (which would just be "Best"/"Great", not "Brilliant").
 *
 * Deliberately strict on path 1: an earlier, looser version (win% floor 25,
 * material floor 2, tolerance 2) was flagging moves in merely-not-yet-lost
 * positions as Brilliant even when a human would call them dubious at best
 * — shallow search sometimes can't fully verify a sacrifice's long-term
 * soundness, so `analyzeGame` additionally re-verifies every candidate at
 * extra depth before committing to the label (see `verifyBrilliantCandidate`).
 */
function detectBrilliantReason(params: {
  fenBefore: string
  pv: string[]
  lines: EngineLine[]
  lineIdx: number
  color: Color
  legalMoveCount: number
}): BrilliantReason | null {
  const { fenBefore, pv, lines, lineIdx, color, legalMoveCount } = params
  if (legalMoveCount <= 1) return null
  if (lineIdx < 0) return null
  const bestWin = winPercentForColor(lines[0].eval, color)
  const thisWin = winPercentForColor(lines[lineIdx].eval, color)
  if (bestWin - thisWin > 1) return null
  if (thisWin < 45) return null

  const swing = materialSwingAlongPv(fenBefore, pv, color)

  if (swing.netChange <= -3) return { kind: 'sacrifice', fenAtEnd: swing.fenAtEnd }

  const evaluation = lines[lineIdx].eval
  if (evaluation.type === 'mate') {
    const mateForMover = color === 'w' ? evaluation.value > 0 : evaluation.value < 0
    if (mateForMover && Math.abs(evaluation.value) >= 2) {
      return { kind: 'mate', movesToMate: Math.abs(evaluation.value) }
    }
  }

  if (swing.netChange >= 5 && swing.netChange - swing.immediateChange >= 3) {
    return { kind: 'materialWin', fenAtEnd: swing.fenAtEnd }
  }

  return null
}

function isBrilliantCandidate(params: {
  fenBefore: string
  pv: string[]
  lines: EngineLine[]
  lineIdx: number
  color: Color
  legalMoveCount: number
}): boolean {
  return detectBrilliantReason(params) !== null
}

/**
 * Plain-language explanation of why a move (or the unplayed best line) is
 * Brilliant, matched to whichever of the three paths above actually
 * triggered, with concrete details (piece, mate distance, resulting
 * evaluation) so the claim is checkable against the board and eval bar
 * instead of a vague qualitative bucket.
 */
export function explainBrilliant(params: {
  fenBefore: string
  pv: string[]
  lines: EngineLine[]
  lineIdx: number
  color: Color
  legalMoveCount: number
}): string {
  const { fenBefore, pv, lines, lineIdx, color, legalMoveCount } = params
  const reason = detectBrilliantReason({ fenBefore, pv, lines, lineIdx, color, legalMoveCount })
  const evalText = formatEvalForColor(lines[lineIdx].eval, color)
  const colorLabel = color === 'w' ? 'Weiß' : 'Schwarz'

  if (reason?.kind === 'mate') {
    return `Erzwingt Matt in ${reason.movesToMate} Zügen — eine Fortsetzung, die nicht offensichtlich ist.`
  }
  if (reason?.kind === 'materialWin') {
    const won = droppedPieceTypes(fenBefore, reason.fenAtEnd, opponentColor(color))
    const pieceText = won.length > 0 ? PIECE_NAMES_DE[won[0]] : 'entscheidend Material'
    return `Gewinnt langfristig ${pieceText} durch eine schwer zu findende Kombination — die Engine bewertet die Stellung danach mit ${evalText} für ${colorLabel}.`
  }
  const fenAtEnd = reason?.kind === 'sacrifice' ? reason.fenAtEnd : materialSwingAlongPv(fenBefore, pv, color).fenAtEnd
  const dropped = droppedPieceTypes(fenBefore, fenAtEnd, color)
  const pieceText = dropped.length > 0 ? PIECE_NAMES_DE[dropped[0]] : 'Material'
  return `Opfert ${pieceText} — die Engine bewertet die Stellung danach weiterhin mit ${evalText} für ${colorLabel}.`
}

/**
 * Re-checks a Brilliant candidate at extra depth/width, since the main pass
 * runs at the game-review depth which can occasionally misjudge whether a
 * sacrifice truly holds up. Returns false (reject) if the played move falls
 * out of the top lines or its evaluation collapses under deeper search.
 */
export async function verifyBrilliantCandidate(params: {
  analyze: (fen: string, opts: { depth: number; multiPv: number }) => Promise<EngineLine[]>
  fenBefore: string
  uci: string
  color: Color
  baseDepth: number
}): Promise<boolean> {
  const { analyze, fenBefore, uci, color, baseDepth } = params
  const deeper = await analyze(fenBefore, { depth: Math.min(28, baseDepth + 6), multiPv: 5 })
  const idx = deeper.findIndex((l) => l.move === uci)
  if (idx < 0) return false
  const bestWin = winPercentForColor(deeper[0].eval, color)
  const thisWin = winPercentForColor(deeper[idx].eval, color)
  if (bestWin - thisWin > 3) return false
  return thisWin >= 40
}

export interface RawMoveData {
  ply: number
  color: Color
  fenBefore: string
  fenAfter: string
  san: string
  uci: string
  /** MultiPV lines searched from fenBefore, best first. */
  lines: EngineLine[]
  /** Accurate eval of fenAfter (White-perspective), from a dedicated search when the played move wasn't in `lines`. */
  evalAfterPlayed: Eval
  legalMoveCount: number
}

export function classifyMove(raw: RawMoveData, opening: OpeningMatch | null): AnalyzedMove {
  const winBefore = winPercentForColor(raw.lines[0].eval, raw.color)
  const winAfter = winPercentForColor(raw.evalAfterPlayed, raw.color)
  const winPercentLoss = Math.max(0, winBefore - winAfter)
  const idxPlayed = raw.lines.findIndex((l) => l.move === raw.uci)

  let classification: Classification
  if (raw.legalMoveCount <= 1) {
    classification = 'forced'
  } else if (opening && raw.ply < opening.plyCount) {
    classification = 'book'
  } else {
    classification = idxPlayed === 0 ? 'best' : tierFromLoss(winPercentLoss)
    if (
      (classification === 'best' || classification === 'excellent') &&
      idxPlayed === 0 &&
      isGreatCandidate(raw.lines, raw.color)
    ) {
      classification = 'great'
    }
    if (
      idxPlayed >= 0 &&
      isBrilliantCandidate({
        fenBefore: raw.fenBefore,
        pv: raw.lines[idxPlayed].pv,
        lines: raw.lines,
        lineIdx: idxPlayed,
        color: raw.color,
        legalMoveCount: raw.legalMoveCount,
      })
    ) {
      classification = 'brilliant'
    }
    if ((classification === 'mistake' || classification === 'blunder') && winBefore >= 85) {
      classification = 'miss'
    }
  }

  const brilliantAvailable = isBrilliantCandidate({
    fenBefore: raw.fenBefore,
    pv: raw.lines[0].pv,
    lines: raw.lines,
    lineIdx: 0,
    color: raw.color,
    legalMoveCount: raw.legalMoveCount,
  })

  let brilliantNote: string | null = null
  if (classification === 'brilliant' && idxPlayed >= 0) {
    brilliantNote = explainBrilliant({
      fenBefore: raw.fenBefore,
      pv: raw.lines[idxPlayed].pv,
      lines: raw.lines,
      lineIdx: idxPlayed,
      color: raw.color,
      legalMoveCount: raw.legalMoveCount,
    })
  } else if (brilliantAvailable) {
    brilliantNote = explainBrilliant({
      fenBefore: raw.fenBefore,
      pv: raw.lines[0].pv,
      lines: raw.lines,
      lineIdx: 0,
      color: raw.color,
      legalMoveCount: raw.legalMoveCount,
    })
  }

  return {
    ply: raw.ply,
    color: raw.color,
    fenBefore: raw.fenBefore,
    fenAfter: raw.fenAfter,
    san: raw.san,
    uci: raw.uci,
    evalBefore: raw.lines[0].eval,
    evalAfterPlayed: raw.evalAfterPlayed,
    lines: raw.lines,
    classification,
    winPercentLoss,
    brilliantAvailable,
    brilliantNote,
    bestMoveUci: raw.lines[0].move,
    bestMoveSan: raw.lines[0].san,
  }
}

export function classifyGame(raws: RawMoveData[], opening: OpeningMatch | null): AnalyzedMove[] {
  return raws.map((raw) => classifyMove(raw, opening))
}

export function computeAccuracy(moves: AnalyzedMove[], color: Color): number {
  const own = moves.filter((m) => m.color === color)
  if (own.length === 0) return 100
  const total = own.reduce((sum, m) => sum + accuracyFromWinPercentLoss(m.winPercentLoss), 0)
  return total / own.length
}
