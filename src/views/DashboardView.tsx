import { useMemo } from 'react'
import { CLASSIFICATION_META } from '../chess/classificationMeta'
import { useAppStore } from '../store/useAppStore'
import type { AnalysisResult, Classification, Color, StoredGame } from '../types'

function myColor(game: StoredGame, username?: string): Color | null {
  if (!username) return null
  if (game.white.toLowerCase() === username.toLowerCase()) return 'w'
  if (game.black.toLowerCase() === username.toLowerCase()) return 'b'
  return null
}

function myResult(game: StoredGame, color: Color): 'win' | 'loss' | 'draw' {
  if (game.result === '1-0') return color === 'w' ? 'win' : 'loss'
  if (game.result === '0-1') return color === 'b' ? 'win' : 'loss'
  return 'draw'
}

interface PersonalRow {
  game: StoredGame
  analysis: AnalysisResult
  color: Color
  accuracy: number
  result: 'win' | 'loss' | 'draw'
}

export default function DashboardView() {
  const games = useAppStore((s) => s.games)
  const analyses = useAppStore((s) => s.analyses)
  const username = useAppStore((s) => s.settings.chesscomUsername)

  const analyzedGames = useMemo(
    () =>
      games
        .filter((g) => analyses[g.id])
        .map((g) => ({ game: g, analysis: analyses[g.id] }))
        .sort((a, b) => (a.game.playedAt ?? '').localeCompare(b.game.playedAt ?? '')),
    [games, analyses],
  )

  const personalRows: PersonalRow[] = useMemo(() => {
    const rows: PersonalRow[] = []
    for (const { game, analysis } of analyzedGames) {
      const color = myColor(game, username)
      if (!color) continue
      rows.push({
        game,
        analysis,
        color,
        accuracy: color === 'w' ? analysis.accuracyWhite : analysis.accuracyBlack,
        result: myResult(game, color),
      })
    }
    return rows
  }, [analyzedGames, username])

  const classificationTotals = useMemo(() => {
    const totals: Partial<Record<Classification, number>> = {}
    let total = 0
    for (const { analysis } of analyzedGames) {
      for (const m of analysis.moves) {
        totals[m.classification] = (totals[m.classification] ?? 0) + 1
        total++
      }
    }
    return { totals, total }
  }, [analyzedGames])

  const openingStats = useMemo(() => {
    const map = new Map<string, { count: number; wins: number; accSum: number }>()
    for (const row of personalRows) {
      const name = row.game.openingName ?? 'Unbekannt'
      const entry = map.get(name) ?? { count: 0, wins: 0, accSum: 0 }
      entry.count++
      entry.accSum += row.accuracy
      if (row.result === 'win') entry.wins++
      map.set(name, entry)
    }
    return [...map.entries()]
      .map(([name, e]) => ({ name, count: e.count, winRate: (100 * e.wins) / e.count, avgAcc: e.accSum / e.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [personalRows])

  const avgAccuracy = personalRows.length
    ? personalRows.reduce((s, r) => s + r.accuracy, 0) / personalRows.length
    : null

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      {!username && (
        <div className="rounded-md border border-(--color-border) bg-(--color-bg-elevated) p-3 text-sm text-(--color-text-muted)">
          Hinterlege deinen chess.com-Benutzernamen in den Einstellungen, um personalisierte Statistiken (Genauigkeit,
          Eröffnungs-Performance) zu sehen.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Analysierte Partien" value={String(analyzedGames.length)} />
        <StatCard label="Ø Genauigkeit" value={avgAccuracy !== null ? `${avgAccuracy.toFixed(1)}%` : '—'} />
        <StatCard label="Brillante Züge" value={String(classificationTotals.totals.brilliant ?? 0)} color={CLASSIFICATION_META.brilliant.color} />
        <StatCard label="Patzer" value={String(classificationTotals.totals.blunder ?? 0)} color={CLASSIFICATION_META.blunder.color} />
      </div>

      {personalRows.length > 1 && (
        <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
          <h2 className="mb-3 text-sm font-semibold text-(--color-text-muted) uppercase">Genauigkeit über Zeit</h2>
          <AccuracySparkline rows={personalRows} />
        </section>
      )}

      <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
        <h2 className="mb-3 text-sm font-semibold text-(--color-text-muted) uppercase">Zugqualität insgesamt</h2>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(CLASSIFICATION_META) as Classification[]).map((c) => {
            const count = classificationTotals.totals[c] ?? 0
            if (count === 0) return null
            const pct = classificationTotals.total ? (100 * count) / classificationTotals.total : 0
            return (
              <div key={c} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0" style={{ color: CLASSIFICATION_META[c].color }}>
                  {CLASSIFICATION_META[c].label}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-(--color-bg)">
                  <div className="h-full" style={{ width: `${pct}%`, backgroundColor: CLASSIFICATION_META[c].color }} />
                </div>
                <span className="w-10 shrink-0 text-right text-(--color-text-muted)">{count}</span>
              </div>
            )
          })}
          {classificationTotals.total === 0 && <p className="text-sm text-(--color-text-muted)">Noch keine analysierten Partien.</p>}
        </div>
      </section>

      {openingStats.length > 0 && (
        <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
          <h2 className="mb-3 text-sm font-semibold text-(--color-text-muted) uppercase">Eröffnungs-Performance</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-(--color-text-muted)">
              <tr>
                <th className="pb-2 font-medium">Eröffnung</th>
                <th className="pb-2 font-medium">Partien</th>
                <th className="pb-2 font-medium">Siegquote</th>
                <th className="pb-2 font-medium">Ø Genauigkeit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {openingStats.map((o) => (
                <tr key={o.name}>
                  <td className="py-1.5 pr-2">{o.name}</td>
                  <td className="py-1.5">{o.count}</td>
                  <td className="py-1.5">{o.winRate.toFixed(0)}%</td>
                  <td className="py-1.5">{o.avgAcc.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elevated) p-4">
      <div className="text-xs text-(--color-text-muted)">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  )
}

function AccuracySparkline({ rows }: { rows: PersonalRow[] }) {
  const width = 600
  const height = 100
  const points = rows.map((r, i) => ({
    x: (i / Math.max(1, rows.length - 1)) * width,
    y: height - (r.accuracy / 100) * height,
  }))
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="var(--color-accent-strong)" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--color-accent-strong)" />
      ))}
    </svg>
  )
}
