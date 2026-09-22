import { BOARD_THEME_IDS, BOARD_THEMES } from '../chess/boardThemes'
import { PIECE_SETS } from '../chess/pieceSets'
import { useAppStore } from '../store/useAppStore'
import type { BoardThemeId, EngineStrength, PieceSetId } from '../types'

export default function SettingsView() {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
        <h2 className="mb-3 text-sm font-semibold text-(--color-text-muted) uppercase">Analyse-Engine (Partie-Review)</h2>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex items-center justify-between">
            <span>Engine-Stärke</span>
            <select
              value={settings.engine.strength}
              onChange={(e) => updateSettings({ engine: { ...settings.engine, strength: e.target.value as EngineStrength } })}
              className="rounded-md border border-(--color-border) bg-(--color-bg) px-2 py-1"
            >
              <option value="lite">Lite (~1.6MB, schnell, immer noch sehr stark)</option>
              <option value="full">Volle Stärke (~95MB, stärkstes NNUE-Netz — nur bei lokalem "npm run dev")</option>
            </select>
          </label>
          <label className="flex items-center justify-between">
            <span>Suchtiefe</span>
            <input
              type="number"
              min={8}
              max={30}
              value={settings.engine.depth}
              onChange={(e) => updateSettings({ engine: { ...settings.engine, depth: Number(e.target.value) } })}
              className="w-20 rounded-md border border-(--color-border) bg-(--color-bg) px-2 py-1"
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Anzahl Varianten (MultiPV)</span>
            <input
              type="number"
              min={1}
              max={5}
              value={settings.engine.multiPv}
              onChange={(e) => updateSettings({ engine: { ...settings.engine, multiPv: Number(e.target.value) } })}
              className="w-20 rounded-md border border-(--color-border) bg-(--color-bg) px-2 py-1"
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Threads</span>
            <input
              type="number"
              min={1}
              max={16}
              value={settings.engine.threads}
              onChange={(e) => updateSettings({ engine: { ...settings.engine, threads: Number(e.target.value) } })}
              className="w-20 rounded-md border border-(--color-border) bg-(--color-bg) px-2 py-1"
            />
          </label>
          <p className="text-xs text-(--color-text-muted)">
            Höhere Suchtiefe und mehr Varianten liefern genauere Klassifikationen, verlangsamen aber die Analyse einer
            ganzen Partie. Mehrere Threads erfordern, dass der Browser die Seite cross-origin-isoliert ausliefert
            (bei chess.benjaminberger.at automatisch der Fall).
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
        <h2 className="mb-3 text-sm font-semibold text-(--color-text-muted) uppercase">Live-Engine (Spielen / Bewertung)</h2>
        <label className="flex items-center justify-between text-sm">
          <span>Engine-Stärke</span>
          <select
            value={settings.liveEngine.strength}
            onChange={(e) => updateSettings({ liveEngine: { ...settings.liveEngine, strength: e.target.value as EngineStrength } })}
            className="rounded-md border border-(--color-border) bg-(--color-bg) px-2 py-1"
          >
            <option value="lite">Lite (schnell, empfohlen)</option>
            <option value="full">Volle Stärke</option>
          </select>
        </label>
      </section>

      <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
        <h2 className="mb-3 text-sm font-semibold text-(--color-text-muted) uppercase">Spielhinweise</h2>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex items-center justify-between">
            <span>Zughinweise (bester Zug als Pfeil)</span>
            <input
              type="checkbox"
              checked={settings.showMoveHints}
              onChange={(e) => updateSettings({ showMoveHints: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Brillante Züge voraussehen</span>
            <input
              type="checkbox"
              checked={settings.showBrilliantHints}
              disabled={!settings.showMoveHints}
              onChange={(e) => updateSettings({ showBrilliantHints: e.target.checked })}
            />
          </label>
          <p className="text-xs text-(--color-text-muted)">
            Gilt für freies Spielen (Spielen-Ansicht und Weiterspielen in der Partieanalyse) — die abgeschlossene
            Partieanalyse selbst zeigt immer alle Hinweise.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
        <h2 className="mb-3 text-sm font-semibold text-(--color-text-muted) uppercase">Darstellung</h2>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex items-center justify-between">
            <span>Brettfarbe</span>
            <div className="flex gap-1.5">
              {BOARD_THEME_IDS.map((id: BoardThemeId) => (
                <button
                  key={id}
                  onClick={() => updateSettings({ boardTheme: id })}
                  title={BOARD_THEMES[id].name}
                  className="h-7 w-7 overflow-hidden rounded border-2"
                  style={{ borderColor: settings.boardTheme === id ? 'var(--color-accent)' : 'transparent' }}
                >
                  <span className="block h-full w-full" style={{ background: `linear-gradient(135deg, ${BOARD_THEMES[id].light} 50%, ${BOARD_THEMES[id].dark} 50%)` }} />
                </button>
              ))}
            </div>
          </label>
          <label className="flex items-center justify-between">
            <span>Figurensatz</span>
            <div className="flex gap-1.5">
              {PIECE_SETS.map((id: PieceSetId) => (
                <button
                  key={id}
                  onClick={() => updateSettings({ pieceSet: id })}
                  className="rounded border px-2 py-1 text-xs capitalize"
                  style={{ borderColor: settings.pieceSet === id ? 'var(--color-accent)' : 'var(--color-border)' }}
                >
                  <img src={`/pieces/${id}/wn.png`} alt="" className="mr-1 inline h-4 w-4 align-middle" />
                  {id}
                </button>
              ))}
            </div>
          </label>
          <label className="flex items-center justify-between">
            <span>Sound-Effekte</span>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
        <h2 className="mb-3 text-sm font-semibold text-(--color-text-muted) uppercase">chess.com</h2>
        <label className="flex items-center justify-between text-sm">
          <span>Benutzername (für persönliche Statistiken)</span>
          <input
            value={settings.chesscomUsername ?? ''}
            onChange={(e) => updateSettings({ chesscomUsername: e.target.value || undefined })}
            className="w-48 rounded-md border border-(--color-border) bg-(--color-bg) px-2 py-1"
          />
        </label>
      </section>
    </div>
  )
}
