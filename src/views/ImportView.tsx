import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChessComError, fetchAllGames, fetchProfile, type ChessComProfile } from '../api/chesscom'
import { PgnParseError, splitPgnGames, storedGameFromPgn } from '../chess/pgn'
import { useAppStore } from '../store/useAppStore'
import type { StoredGame } from '../types'

function resultLabel(game: StoredGame): string {
  if (game.result === '1-0') return '1-0'
  if (game.result === '0-1') return '0-1'
  if (game.result === '1/2-1/2') return '½-½'
  return '*'
}

export default function ImportView() {
  const games = useAppStore((s) => s.games)
  const analyses = useAppStore((s) => s.analyses)
  const addGames = useAppStore((s) => s.addGames)
  const removeGame = useAppStore((s) => s.removeGame)
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const navigate = useNavigate()

  const [username, setUsername] = useState(settings.chesscomUsername ?? '')
  const [profile, setProfile] = useState<ChessComProfile | null>(null)
  const [ccStatus, setCcStatus] = useState<string | null>(null)
  const [ccError, setCcError] = useState<string | null>(null)
  const [ccLoading, setCcLoading] = useState(false)

  const [pgnText, setPgnText] = useState('')
  const [pgnStatus, setPgnStatus] = useState<string | null>(null)
  const [pgnError, setPgnError] = useState<string | null>(null)

  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  async function handleImportFromChessCom() {
    if (!username.trim()) return
    setCcLoading(true)
    setCcError(null)
    setCcStatus('Lade Profil…')
    try {
      const p = await fetchProfile(username.trim())
      setProfile(p)
      await updateSettings({ chesscomUsername: username.trim() })
      setCcStatus('Lade Partien…')
      const fetched = await fetchAllGames(username.trim(), (progress) => {
        setCcStatus(`Lade Monat ${progress.monthsDone} / ${progress.monthsTotal}…`)
      })
      const added = await addGames(fetched)
      setCcStatus(`${fetched.length} Partien gefunden, ${added} neu importiert.`)
    } catch (err) {
      setCcError(err instanceof ChessComError ? err.message : 'Unbekannter Fehler beim Import.')
      setCcStatus(null)
    } finally {
      setCcLoading(false)
    }
  }

  async function handleImportPgn() {
    setPgnError(null)
    setPgnStatus(null)
    const games_ = splitPgnGames(pgnText)
    if (games_.length === 0) {
      setPgnError('Kein PGN erkannt.')
      return
    }
    try {
      const parsed = games_.map((g) => storedGameFromPgn(g))
      const added = await addGames(parsed)
      setPgnStatus(`${games_.length} Partie(n) erkannt, ${added} neu importiert.`)
      setPgnText('')
    } catch (err) {
      setPgnError(err instanceof PgnParseError ? err.message : 'Fehler beim Parsen des PGN.')
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setPgnText(text)
    e.target.value = ''
  }

  const filteredGames = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const matching = !q
      ? games
      : games.filter(
          (g) => g.white.toLowerCase().includes(q) || g.black.toLowerCase().includes(q) || g.openingName?.toLowerCase().includes(q),
        )
    // Newest-played game first; games without a known play date (rare, some
    // manual PGN pastes) fall back to import order and sort after dated ones.
    return [...matching].sort((a, b) => {
      const aTime = a.playedAt ? Date.parse(a.playedAt) : 0
      const bTime = b.playedAt ? Date.parse(b.playedAt) : 0
      if (aTime !== bTime) return bTime - aTime
      return b.importedAt.localeCompare(a.importedAt)
    })
  }, [games, filter])

  const pageCount = Math.max(1, Math.ceil(filteredGames.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pagedGames = filteredGames.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE)

  // Reset to page 1 whenever the filter narrows/widens the result set, without an effect.
  const [trackedFilter, setTrackedFilter] = useState(filter)
  if (filter !== trackedFilter) {
    setTrackedFilter(filter)
    setPage(0)
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
          <h2 className="mb-3 text-sm font-semibold text-(--color-text-muted) uppercase">chess.com Account</h2>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="chess.com Benutzername"
              className="flex-1 rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
              onKeyDown={(e) => e.key === 'Enter' && handleImportFromChessCom()}
            />
            <button
              onClick={handleImportFromChessCom}
              disabled={ccLoading}
              className="rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              {ccLoading ? '…' : 'Importieren'}
            </button>
          </div>
          {profile && (
            <div className="mt-3 flex items-center gap-2 text-sm text-(--color-text-muted)">
              {profile.avatar && <img src={profile.avatar} alt="" className="h-8 w-8 rounded" />}
              <span>{profile.name ?? profile.username}</span>
            </div>
          )}
          {ccStatus && <p className="mt-2 text-sm text-(--color-text-muted)">{ccStatus}</p>}
          {ccError && <p className="mt-2 text-sm text-(--color-blunder)">{ccError}</p>}
        </section>

        <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
          <h2 className="mb-3 text-sm font-semibold text-(--color-text-muted) uppercase">PGN importieren</h2>
          <textarea
            value={pgnText}
            onChange={(e) => setPgnText(e.target.value)}
            placeholder="PGN hier einfügen (eine oder mehrere Partien)…"
            rows={4}
            className="w-full resize-none rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2 text-xs font-mono outline-none focus:border-(--color-accent)"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={handleImportPgn}
              disabled={!pgnText.trim()}
              className="rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              Importieren
            </button>
            <label className="cursor-pointer rounded-md border border-(--color-border) px-4 py-2 text-sm hover:bg-white/5">
              Datei wählen
              <input type="file" accept=".pgn,.txt" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
          {pgnStatus && <p className="mt-2 text-sm text-(--color-text-muted)">{pgnStatus}</p>}
          {pgnError && <p className="mt-2 text-sm text-(--color-blunder)">{pgnError}</p>}
        </section>
      </div>

      <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated)">
        <div className="flex items-center justify-between border-b border-(--color-border) p-4">
          <h2 className="text-sm font-semibold text-(--color-text-muted) uppercase">
            Bibliothek ({games.length})
          </h2>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtern…"
            className="w-48 rounded-md border border-(--color-border) bg-(--color-bg) px-2 py-1 text-sm outline-none focus:border-(--color-accent)"
          />
        </div>
        <div className="max-h-[32rem] divide-y divide-(--color-border) overflow-y-auto">
          {filteredGames.length === 0 && (
            <p className="p-4 text-sm text-(--color-text-muted)">Noch keine Partien importiert.</p>
          )}
          {pagedGames.map((game) => {
            const analysis = analyses[game.id]
            return (
              <div
                key={game.id}
                className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/5"
                onClick={() => navigate(`/game/${encodeURIComponent(game.id)}`)}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    <span className="font-medium">{game.white}</span>
                    {game.whiteRating ? ` (${game.whiteRating})` : ''}
                    <span className="text-(--color-text-muted)"> vs </span>
                    <span className="font-medium">{game.black}</span>
                    {game.blackRating ? ` (${game.blackRating})` : ''}
                  </div>
                  <div className="truncate text-xs text-(--color-text-muted)">
                    {game.openingName ?? 'Unbekannte Eröffnung'}
                    {game.playedAt ? ` · ${new Date(game.playedAt).toLocaleDateString('de-AT')}` : ''}
                  </div>
                </div>
                <span className="w-14 shrink-0 text-center text-sm font-semibold">{resultLabel(game)}</span>
                {analysis ? (
                  <span className="shrink-0 rounded-full bg-(--color-bg-panel) px-2 py-0.5 text-xs text-(--color-accent-strong)">
                    {analysis.accuracyWhite.toFixed(0)}% / {analysis.accuracyBlack.toFixed(0)}%
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-(--color-bg-panel) px-2 py-0.5 text-xs text-(--color-text-muted)">
                    nicht analysiert
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeGame(game.id)
                  }}
                  className="shrink-0 rounded px-2 py-1 text-xs text-(--color-text-muted) hover:bg-white/10 hover:text-(--color-blunder)"
                  title="Entfernen"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
        {filteredGames.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-(--color-border) px-4 py-2 text-sm text-(--color-text-muted)">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              className="rounded px-2 py-1 hover:bg-white/10 disabled:opacity-30"
            >
              ◀ Zurück
            </button>
            <span>
              Seite {clampedPage + 1} / {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={clampedPage >= pageCount - 1}
              className="rounded px-2 py-1 hover:bg-white/10 disabled:opacity-30"
            >
              Weiter ▶
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
