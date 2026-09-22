import type { AppSettings, EngineSettings } from '../types'

const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  // Self-hosted (see README) has no static-asset size limit, so full-game
  // review uses Stockfish's full-strength NNUE build by default. Deeper
  // search also meaningfully reduces misclassified "Fehler"/"Patzer" from
  // shallow-search noise.
  strength: 'full',
  depth: 18,
  multiPv: 3,
  threads: Math.max(1, Math.min(6, cores - 1)),
}

export const DEFAULT_LIVE_ENGINE_SETTINGS: EngineSettings = {
  strength: 'lite',
  depth: 14,
  multiPv: 3,
  threads: 1,
}

export const DEFAULT_SETTINGS: AppSettings = {
  engine: DEFAULT_ENGINE_SETTINGS,
  liveEngine: DEFAULT_LIVE_ENGINE_SETTINGS,
  boardTheme: 'green',
  pieceSet: 'neo',
  soundEnabled: true,
  showMoveHints: true,
  showBrilliantHints: true,
}
