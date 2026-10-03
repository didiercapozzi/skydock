import { useEffect, useState } from 'react'
import type { ZodType } from 'zod'
import { routingEngine } from '../helpers/routing'

type LoaderUrl = Parameters<typeof routingEngine.loader>[0]['url']

/* Asks one of the board's loaders for its answer and reads it through its schema — the same thing
   every page of files and every dialog that lists something did by hand. Asked again whenever `deps`
   change (and `skip` is false); an answer that arrives after the page moved on is dropped.
   `data` is null until the first answer; `problem` is `failed` when the answer could not be read or
   the loader could not be reached. `onData` hears each answer read, for whoever keeps more than it. */
const useLoaded = <T>(
  url: LoaderUrl,
  schema: ZodType<T>,
  options: {
    failed: string
    deps?: unknown[]
    skip?: boolean
    onData?: (data: T) => void
  }
) => {
  const { failed, deps = [], skip = false, onData } = options
  const [data, setData] = useState<T | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (skip) return
    let cancelled = false
    routingEngine
      .loader({ url })
      .then((raw) => {
        if (cancelled) return
        const parsed = schema.safeParse(raw)
        if (parsed.success) {
          setData(parsed.data)
          setProblem(null)
          onData?.(parsed.data)
        } else setProblem(failed)
      })
      .catch(() => {
        if (!cancelled) setProblem(failed)
      })
    return () => {
      cancelled = true
    }
    // the caller says what asks again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, skip, ...deps])

  return { data, problem, setData, setProblem }
}

export { useLoaded }
