export type Color = 'w' | 'b'

export type GameSource = 'chesscom' | 'pgn'

export interface StoredGame {
  id: string
  source: GameSource
  pgn: string
  white: string
  black: string
  whiteRating?: number
  blackRating?: number
  result: '1-0' | '0-1' | '1/2-1/2' | '*'
  /** ISO 8601 date of when the game was played, if known. */
  playedAt?: string
  timeControl?: string
  timeClass?: 'bullet' | 'blitz' | 'rapid' | 'daily' | 'classical' | 'unknown'
  eco?: string
  openingName?: string
  chesscomUrl?: string
  /** When this game was imported into ChessAnalyzer. */
  importedAt: string
}

/** Centipawn/mate evaluation, always normalized to White's perspective. */
export type Eval = { type: 'cp'; value: number } | { type: 'mate'; value: number }

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss'
  | 'forced'

export interface EngineLine {
  /** UCI move, e.g. "e2e4". */
  move: string
  san: string
  eval: Eval
  /** Principal variation as UCI moves, engine's best-line continuation. */
  pv: string[]
}

export interface AnalyzedMove {
  /** 0-indexed half-move number. */
  ply: number
  color: Color
  /** FEN of the position BEFORE this move was played. */
  fenBefore: string
  /** FEN of the position AFTER this move was played. */
  fenAfter: string
  san: string
  uci: string
  /** Engine eval of fenBefore (i.e. best achievable for the side to move). */
  evalBefore: Eval
  /** Engine eval of fenAfter (i.e. the actual result of the played move). */
  evalAfterPlayed: Eval
  /** Top engine lines at fenBefore (MultiPV), best first. */
  lines: EngineLine[]
  classification: Classification
  /** Win% loss for the mover vs. the engine's best line, clamped to >= 0. */
  winPercentLoss: number
  /**
   * True when the engine's best line at fenBefore qualifies as a Brilliant
   * move by our heuristic, regardless of what was actually played. Lets the
   * review UI show "you could have played a brilliant move here" even when
   * the played move itself was fine.
   */
  brilliantAvailable: boolean
  /** Plain-language reason a Brilliant classification (played or available-but-missed) applies, if either does. */
  brilliantNote: string | null
  bestMoveUci: string
  bestMoveSan: string
}

export interface AnalysisResult {
  gameId: string
  /** Hash of the EngineSettings used, so changing settings invalidates the cache. */
  settingsHash: string
  moves: AnalyzedMove[]
  accuracyWhite: number
  accuracyBlack: number
  generatedAt: string
}

export type EngineStrength = 'lite' | 'full'
export type BoardThemeId = 'green' | 'brown' | 'blue' | 'gray'
export type PieceSetId = 'neo' | 'wood' | 'glass'

export interface EngineSettings {
  strength: EngineStrength
  /** Search depth per position during full-game review. */
  depth: number
  multiPv: number
  threads: number
}

export interface AppSettings {
  engine: EngineSettings
  liveEngine: EngineSettings
  boardTheme: BoardThemeId
  pieceSet: PieceSetId
  soundEnabled: boolean
  /** Permanent best-move arrow while playing/exploring (not the post-hoc game review, which always shows it). */
  showMoveHints: boolean
  /** "Brilliant move available" callouts while playing/exploring. Ignored when showMoveHints is off. */
  showBrilliantHints: boolean
  chesscomUsername?: string
}
