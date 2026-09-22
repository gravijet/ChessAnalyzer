import { Chess } from 'chess.js'
import type { StoredGame } from '../types'

export interface ParsedPly {
  ply: number
  color: 'w' | 'b'
  san: string
  uci: string
  fenBefore: string
  fenAfter: string
}

export interface ParsedGame {
  headers: Record<string, string | null>
  plies: ParsedPly[]
}

export class PgnParseError extends Error {}

export function parsePgn(pgn: string): ParsedGame {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch (err) {
    throw new PgnParseError(err instanceof Error ? err.message : 'Ungültiges PGN.')
  }
  const headers = chess.header()
  const history = chess.history({ verbose: true })
  const plies: ParsedPly[] = history.map((move, i) => ({
    ply: i,
    color: move.color,
    san: move.san,
    uci: move.lan,
    fenBefore: move.before,
    fenAfter: move.after,
  }))
  return { headers, plies }
}

/** Splits a text blob containing one or more concatenated PGN games. */
export function splitPgnGames(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  const chunks = normalized.split(/(?=^\[Event )/m)
  return chunks.map((c) => c.trim()).filter(Boolean)
}

function resultFromHeader(result: string | null | undefined): StoredGame['result'] {
  if (result === '1-0' || result === '0-1' || result === '1/2-1/2') return result
  return '*'
}

function orUndef(value: string | null | undefined): string | undefined {
  return value ?? undefined
}

export function storedGameFromPgn(pgn: string): StoredGame {
  const { headers } = parsePgn(pgn)
  const white = headers.White ?? '?'
  const black = headers.Black ?? '?'
  const dateStr = headers.UTCDate ?? headers.Date
  let playedAt: string | undefined
  if (dateStr && /^\d{4}\.\d{2}\.\d{2}$/.test(dateStr)) {
    playedAt = new Date(dateStr.replace(/\./g, '-')).toISOString()
  }
  return {
    id: `pgn:${crypto.randomUUID()}`,
    source: 'pgn',
    pgn,
    white,
    black,
    whiteRating: headers.WhiteElo ? Number(headers.WhiteElo) : undefined,
    blackRating: headers.BlackElo ? Number(headers.BlackElo) : undefined,
    result: resultFromHeader(headers.Result),
    playedAt,
    timeControl: orUndef(headers.TimeControl),
    timeClass: 'unknown',
    eco: orUndef(headers.ECO),
    openingName: orUndef(headers.Opening),
    importedAt: new Date().toISOString(),
  }
}
