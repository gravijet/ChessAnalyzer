import { create } from 'zustand'
import { DEFAULT_SETTINGS } from '../engine/defaultSettings'
import * as db from '../storage/db'
import type { AnalysisResult, AppSettings, StoredGame } from '../types'

interface AppState {
  initialized: boolean
  games: StoredGame[]
  analyses: Record<string, AnalysisResult>
  settings: AppSettings
  init: () => Promise<void>
  addGames: (games: StoredGame[]) => Promise<number>
  removeGame: (id: string) => Promise<void>
  setAnalysis: (result: AnalysisResult) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  games: [],
  analyses: {},
  settings: DEFAULT_SETTINGS,

  async init() {
    if (get().initialized) return
    const [games, settings, analyses] = await Promise.all([
      db.getAllGames(),
      db.loadSettings(),
      db.getAllAnalyses(),
    ])
    const analysesMap: Record<string, AnalysisResult> = {}
    for (const a of analyses) analysesMap[a.gameId] = a
    set({
      games,
      settings: settings ?? DEFAULT_SETTINGS,
      analyses: analysesMap,
      initialized: true,
    })
  },

  async addGames(newGames) {
    const existingIds = new Set(get().games.map((g) => g.id))
    const toSave = newGames.filter((g) => !existingIds.has(g.id))
    if (toSave.length === 0) return 0
    await db.saveGames(toSave)
    set((state) => ({ games: [...toSave, ...state.games] }))
    return toSave.length
  },

  async removeGame(id) {
    await db.deleteGame(id)
    set((state) => ({
      games: state.games.filter((g) => g.id !== id),
      analyses: Object.fromEntries(Object.entries(state.analyses).filter(([key]) => key !== id)),
    }))
  },

  async setAnalysis(result) {
    await db.saveAnalysis(result)
    set((state) => ({ analyses: { ...state.analyses, [result.gameId]: result } }))
  },

  async updateSettings(patch) {
    const next = { ...get().settings, ...patch }
    await db.saveSettings(next)
    set({ settings: next })
  },
}))
