import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AnalysisResult, AppSettings, StoredGame } from '../types'

interface ChessAnalyzerDB extends DBSchema {
  games: {
    key: string
    value: StoredGame
    indexes: { 'by-importedAt': string; 'by-playedAt': string }
  }
  analysis: {
    key: string
    value: AnalysisResult
  }
  settings: {
    key: string
    value: AppSettings
  }
}

const DB_NAME = 'chess-analyzer'
const DB_VERSION = 1
const SETTINGS_KEY = 'app-settings'

let dbPromise: Promise<IDBPDatabase<ChessAnalyzerDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ChessAnalyzerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const games = db.createObjectStore('games', { keyPath: 'id' })
        games.createIndex('by-importedAt', 'importedAt')
        games.createIndex('by-playedAt', 'playedAt')
        db.createObjectStore('analysis', { keyPath: 'gameId' })
        db.createObjectStore('settings')
      },
    })
  }
  return dbPromise
}

export async function saveGame(game: StoredGame): Promise<void> {
  const db = await getDb()
  await db.put('games', game)
}

export async function saveGames(games: StoredGame[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('games', 'readwrite')
  await Promise.all([...games.map((g) => tx.store.put(g)), tx.done])
}

export async function getGame(id: string): Promise<StoredGame | undefined> {
  const db = await getDb()
  return db.get('games', id)
}

export async function getAllGames(): Promise<StoredGame[]> {
  const db = await getDb()
  const games = await db.getAllFromIndex('games', 'by-importedAt')
  return games.reverse()
}

export async function deleteGame(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['games', 'analysis'], 'readwrite')
  await Promise.all([tx.objectStore('games').delete(id), tx.objectStore('analysis').delete(id), tx.done])
}

export async function saveAnalysis(result: AnalysisResult): Promise<void> {
  const db = await getDb()
  await db.put('analysis', result)
}

export async function getAnalysis(gameId: string): Promise<AnalysisResult | undefined> {
  const db = await getDb()
  return db.get('analysis', gameId)
}

export async function getAllAnalyses(): Promise<AnalysisResult[]> {
  const db = await getDb()
  return db.getAll('analysis')
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb()
  await db.put('settings', settings, SETTINGS_KEY)
}

export async function loadSettings(): Promise<AppSettings | undefined> {
  const db = await getDb()
  return db.get('settings', SETTINGS_KEY)
}
