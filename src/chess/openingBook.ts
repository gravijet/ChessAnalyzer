export interface OpeningEntry {
  eco: string
  name: string
  moves: string[]
}

export interface OpeningMatch {
  eco: string
  name: string
  plyCount: number
}

// Openings tend to stop being "theory" well before move 30; capping the
// search keeps lookups cheap on long games.
const MAX_BOOK_PLIES = 30

interface Book {
  /** Every prefix (of every length) of every catalogued line, so a game that
   * continues past a named entry without deviating is still "book" even if
   * that exact continuation was never itself given its own name. */
  prefixes: Set<string>
  /** Full catalogued entries, keyed by their exact move sequence, for naming. */
  named: Map<string, OpeningEntry>
}

let bookPromise: Promise<Book> | null = null

function loadBook(): Promise<Book> {
  if (!bookPromise) {
    bookPromise = fetch('/data/openings.json')
      .then((r) => r.json() as Promise<OpeningEntry[]>)
      .then((entries) => {
        const prefixes = new Set<string>()
        const named = new Map<string, OpeningEntry>()
        for (const entry of entries) {
          named.set(entry.moves.join(' '), entry)
          for (let len = 1; len <= entry.moves.length; len++) {
            prefixes.add(entry.moves.slice(0, len).join(' '))
          }
        }
        return { prefixes, named }
      })
  }
  return bookPromise
}

/**
 * Finds how far the game's actual moves stay within known opening theory.
 * A position counts as "book" as soon as it's a prefix of *any* catalogued
 * line, not only at points that happen to be a named entry themselves —
 * otherwise a game that plays on past a named line's endpoint without
 * deviating would incorrectly fall out of "book" a move early. The reported
 * name is the deepest named entry at or before that point.
 */
export async function findOpening(sanHistory: string[]): Promise<OpeningMatch | null> {
  const book = await loadBook()
  const max = Math.min(MAX_BOOK_PLIES, sanHistory.length)
  for (let len = max; len >= 1; len--) {
    const key = sanHistory.slice(0, len).join(' ')
    if (!book.prefixes.has(key)) continue
    for (let nameLen = len; nameLen >= 1; nameLen--) {
      const entry = book.named.get(sanHistory.slice(0, nameLen).join(' '))
      if (entry) return { eco: entry.eco, name: entry.name, plyCount: len }
    }
    return { eco: '', name: 'Theorie', plyCount: len }
  }
  return null
}
