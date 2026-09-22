import { useEffect, useState } from 'react'
import { StockfishEngine, type EngineCreateOptions } from './stockfishEngine'

/**
 * Keeps a StockfishEngine worker alive for as long as `opts` is non-null and
 * its identity (strength/threads/multiPv) doesn't change, terminating the
 * worker on unmount or when a new engine needs to be spun up.
 */
export function useStockfish(opts: EngineCreateOptions | null) {
  const [engine, setEngine] = useState<StockfishEngine | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = opts ? `${opts.strength}:${opts.threads}:${opts.multiPv}` : null

  useEffect(() => {
    if (!opts) {
      setEngine(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    StockfishEngine.create(opts)
      .then((created) => {
        if (cancelled) {
          created.terminate()
          return
        }
        setEngine(created)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      setEngine((current) => {
        current?.terminate()
        return null
      })
    }
    // Only strength/threads/multiPv identity should trigger a re-create.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { engine, loading, error }
}
