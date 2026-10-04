import { useEffect, useState } from 'react'
import type { ZodType } from 'zod'
import { routingEngine } from '../helpers/routing'

type LoaderUrl = Parameters<typeof routingEngine.loader>[0]['url']

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, skip, ...deps])

  return { data, problem, setData, setProblem }
}

export { useLoaded }
