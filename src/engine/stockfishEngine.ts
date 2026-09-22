import { sideToMoveOf, uciToSan } from '../chess/notation'
import type { EngineLine, EngineStrength } from '../types'
import { parseInfoLine, toWhitePerspective, type UciInfoLine } from './uci'

export interface EngineCreateOptions {
  strength: EngineStrength
  threads?: number
  multiPv?: number
  hashMb?: number
}

export interface AnalyzeOptions {
  /** Fixed search depth. Mutually exclusive with movetimeMs. */
  depth?: number
  /** Fixed thinking time in ms. Mutually exclusive with depth. */
  movetimeMs?: number
  multiPv?: number
  onUpdate?: (lines: EngineLine[], depth: number) => void
  timeoutMs?: number
}

function engineFileName(strength: EngineStrength, threaded: boolean): string {
  const base = strength === 'full' ? 'stockfish-19' : 'stockfish-19-lite'
  return threaded ? `${base}.js` : `${base}-single.js`
}

function buildLines(
  byMultipv: Map<number, UciInfoLine>,
  fen: string,
  sideToMove: 'w' | 'b',
): EngineLine[] {
  return [...byMultipv.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, info]) => {
      const move = info.pv[0]
      let san = move
      try {
        san = uciToSan(fen, move)
      } catch {
        // Engine occasionally reports a pv for a position that just changed
        // out from under it; keep the raw UCI move as a fallback label.
      }
      return {
        move,
        san,
        eval: toWhitePerspective(info.eval, sideToMove),
        pv: info.pv,
      }
    })
}

/**
 * Thin wrapper around a Stockfish WASM build running in a Web Worker,
 * speaking raw UCI over postMessage. Calls are serialized internally so
 * callers can fire requests without worrying about overlapping searches.
 */
export class StockfishEngine {
  private worker: Worker
  private lineListeners: Array<(line: string) => void> = []
  private queue: Promise<unknown> = Promise.resolve()
  private multiPv: number
  readonly threaded: boolean
  readonly strength: EngineStrength

  private constructor(worker: Worker, threaded: boolean, strength: EngineStrength, multiPv: number) {
    this.worker = worker
    this.threaded = threaded
    this.strength = strength
    this.multiPv = multiPv
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data)
      for (const listener of [...this.lineListeners]) listener(line)
    }
  }

  static async create(opts: EngineCreateOptions): Promise<StockfishEngine> {
    const wantsThreads = (opts.threads ?? 1) > 1
    const threaded = Boolean(self.crossOriginIsolated) && wantsThreads
    const file = engineFileName(opts.strength, threaded)
    const worker = new Worker(`/stockfish/${file}`)
    const multiPv = opts.multiPv ?? 1
    const engine = new StockfishEngine(worker, threaded, opts.strength, multiPv)
    await engine.handshake({
      threads: threaded ? (opts.threads ?? 1) : 1,
      multiPv,
      hashMb: opts.hashMb ?? 128,
    })
    return engine
  }

  private send(cmd: string): void {
    this.worker.postMessage(cmd)
  }

  private waitForLine(match: (line: string) => boolean, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineListeners = this.lineListeners.filter((l) => l !== listener)
        reject(new Error('Timeout beim Warten auf die Stockfish-Engine.'))
      }, timeoutMs)
      const listener = (line: string) => {
        if (match(line)) {
          clearTimeout(timer)
          this.lineListeners = this.lineListeners.filter((l) => l !== listener)
          resolve(line)
        }
      }
      this.lineListeners.push(listener)
    })
  }

  private async handshake(opts: { threads: number; multiPv: number; hashMb: number }): Promise<void> {
    this.send('uci')
    await this.waitForLine((l) => l === 'uciok', 20000)
    this.send(`setoption name MultiPV value ${opts.multiPv}`)
    if (this.threaded) this.send(`setoption name Threads value ${opts.threads}`)
    this.send(`setoption name Hash value ${opts.hashMb}`)
    this.send('isready')
    await this.waitForLine((l) => l === 'readyok', 20000)
  }

  /** Limits engine strength for play-vs-engine mode. Pass null to play at full strength. */
  async setStrengthLimit(elo: number | null): Promise<void> {
    if (elo === null) {
      this.send('setoption name UCI_LimitStrength value false')
    } else {
      const clamped = Math.max(1320, Math.min(3190, Math.round(elo)))
      this.send('setoption name UCI_LimitStrength value true')
      this.send(`setoption name UCI_Elo value ${clamped}`)
    }
    this.send('isready')
    await this.waitForLine((l) => l === 'readyok', 20000)
  }

  private async runAnalysis(fen: string, opts: AnalyzeOptions): Promise<EngineLine[]> {
    if (!opts.depth && !opts.movetimeMs) {
      throw new Error('analyzePosition benötigt entweder depth oder movetimeMs.')
    }
    const sideToMove = sideToMoveOf(fen)

    if (opts.multiPv && opts.multiPv !== this.multiPv) {
      this.multiPv = opts.multiPv
      this.send(`setoption name MultiPV value ${opts.multiPv}`)
      this.send('isready')
      await this.waitForLine((l) => l === 'readyok', 20000)
    }

    this.send(`position fen ${fen}`)

    const byMultipv = new Map<number, UciInfoLine>()
    let latestDepth = 0
    const onLine = (line: string) => {
      const info = parseInfoLine(line)
      if (!info) return
      byMultipv.set(info.multipv, info)
      latestDepth = Math.max(latestDepth, info.depth)
      opts.onUpdate?.(buildLines(byMultipv, fen, sideToMove), latestDepth)
    }
    this.lineListeners.push(onLine)

    this.send(opts.depth ? `go depth ${opts.depth}` : `go movetime ${opts.movetimeMs}`)
    try {
      await this.waitForLine((l) => l.startsWith('bestmove'), opts.timeoutMs ?? 120000)
    } finally {
      this.lineListeners = this.lineListeners.filter((l) => l !== onLine)
    }

    return buildLines(byMultipv, fen, sideToMove)
  }

  /** Queues an analysis request; calls resolve in the order they were made. */
  analyzePosition(fen: string, opts: AnalyzeOptions): Promise<EngineLine[]> {
    const result = this.queue.then(() => this.runAnalysis(fen, opts))
    this.queue = result.catch(() => undefined)
    return result
  }

  /** Asks the engine to stop searching early; the in-flight analyzePosition call resolves with its current best guess. */
  stop(): void {
    this.send('stop')
  }

  terminate(): void {
    this.worker.terminate()
  }
}
