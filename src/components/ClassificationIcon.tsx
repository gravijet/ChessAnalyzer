import { CLASSIFICATION_META } from '../chess/classificationMeta'
import type { Classification } from '../types'

export default function ClassificationIcon({
  classification,
  size = 20,
}: {
  classification: Classification
  size?: number
}) {
  const meta = CLASSIFICATION_META[classification]
  return (
    <span
      title={meta.label}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ backgroundColor: meta.color, width: size, height: size, fontSize: size * 0.5 }}
    >
      {meta.glyph}
    </span>
  )
}
