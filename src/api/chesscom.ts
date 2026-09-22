import type { StoredGame } from '../types'

const API_BASE = 'https://api.chess.com/pub'

export class ChessComError extends Error {}

interface ChessComPlayerResult {
  '@id': string
  username: string
  rating?: number
  result: string
}

interface ChessComGame {
  url: string
  pgn: string
  time_control: string
  end_time: number
  rated: boolean
  time_class: StoredGame['timeClass']
  eco?: string
  white: ChessComPlayerResult
  black: ChessComPlayerResult
}

interface ChessComArchiveResponse {
  games: ChessComGame[]
}

interface ChessComArchivesResponse {
  archives: string[]
}

export interface ChessComProfile {
  username: string
  name?: string
  avatar?: string
  country?: string
  followers?: number
  league?: string
  joined?: number
}

async function chessComFetch<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new ChessComError('Netzwerkfehler beim Erreichen der chess.com API.')
  }
  if (res.status === 404) {
    throw new ChessComError('Account nicht gefunden.')
  }
  if (!res.ok) {
    throw new ChessComError(`chess.com API antwortete mit ${res.status}.`)
  }
  return (await res.json()) as T
}

export async function fetchProfile(username: string): Promise<ChessComProfile> {
  return chessComFetch<ChessComProfile>(`${API_BASE}/player/${encodeURIComponent(username)}`)
}

export async function fetchArchiveUrls(username: string): Promise<string[]> {
  const data = await chessComFetch<ChessComArchivesResponse>(
    `${API_BASE}/player/${encodeURIComponent(username)}/games/archives`,
  )
  return data.archives
}

function openingNameFromEco(eco?: string): string | undefined {
  if (!eco) return undefined
  // eco is a URL like https://www.chess.com/openings/Sicilian-Defense-2...
  const last = eco.split('/').pop()
  if (!last) return undefined
  return decodeURIComponent(last).replace(/-/g, ' ')
}

function toStoredGame(game: ChessComGame): StoredGame {
  return {
    id: game.url,
    source: 'chesscom',
    pgn: game.pgn,
    white: game.white.username,
    black: game.black.username,
    whiteRating: game.white.rating,
    blackRating: game.black.rating,
    result: resultFromPlayers(game.white.result, game.black.result),
    playedAt: new Date(game.end_time * 1000).toISOString(),
    timeControl: game.time_control,
    timeClass: game.time_class ?? 'unknown',
    eco: game.eco,
    openingName: openingNameFromEco(game.eco),
    chesscomUrl: game.url,
    importedAt: new Date().toISOString(),
  }
}

function resultFromPlayers(white: string, black: string): StoredGame['result'] {
  if (white === 'win') return '1-0'
  if (black === 'win') return '0-1'
  const draws = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', 'timevsinsufficient', '50move'])
  if (draws.has(white) || draws.has(black)) return '1/2-1/2'
  return '*'
}

export interface ImportProgress {
  monthsDone: number
  monthsTotal: number
}

export async function fetchAllGames(
  username: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<StoredGame[]> {
  const archives = await fetchArchiveUrls(username)
  const games: StoredGame[] = []
  for (let i = 0; i < archives.length; i++) {
    const data = await chessComFetch<ChessComArchiveResponse>(archives[i])
    for (const g of data.games) {
      if (!g.pgn) continue
      games.push(toStoredGame(g))
    }
    onProgress?.({ monthsDone: i + 1, monthsTotal: archives.length })
  }
  return games
}
