import type { Classification } from '../types'

export interface ClassificationMeta {
  label: string
  color: string
  glyph: string
}

export const CLASSIFICATION_META: Record<Classification, ClassificationMeta> = {
  brilliant: { label: 'Brillant', color: 'var(--color-brilliant)', glyph: '!!' },
  great: { label: 'Großartig', color: 'var(--color-great)', glyph: '!' },
  best: { label: 'Bester Zug', color: 'var(--color-best)', glyph: '★' },
  excellent: { label: 'Exzellent', color: 'var(--color-excellent)', glyph: '✓' },
  good: { label: 'Gut', color: 'var(--color-good)', glyph: '✓' },
  book: { label: 'Theorie', color: 'var(--color-book)', glyph: '📖' },
  inaccuracy: { label: 'Ungenauigkeit', color: 'var(--color-inaccuracy)', glyph: '?!' },
  mistake: { label: 'Fehler', color: 'var(--color-mistake)', glyph: '?' },
  blunder: { label: 'Patzer', color: 'var(--color-blunder)', glyph: '??' },
  miss: { label: 'Verpasst', color: 'var(--color-miss)', glyph: '✗' },
  forced: { label: 'Erzwungen', color: 'var(--color-forced)', glyph: '□' },
}
