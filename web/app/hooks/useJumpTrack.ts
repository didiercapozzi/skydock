import { jumpTrackSchema } from '@skydock/scripts/client'
import type { JumpTrack } from '@skydock/scripts'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { getTrackUrl } from '../components/utils'

const answerSchema = z.object({ track: jumpTrackSchema.nullable() })

const useJumpTrack = (path: string | null) => {
  const [answered, setAnswered] = useState<{ path: string; track: JumpTrack | null } | null>(null)

  useEffect(() => {
    if (!path) return
    const asked = new AbortController()
    fetch(getTrackUrl(path), { signal: asked.signal })
      .then(async (answer) => answerSchema.safeParse(await answer.json()))
      .then((parsed) => setAnswered({ path, track: parsed.success ? parsed.data.track : null }))
      .catch(() => {
        if (!asked.signal.aborted) setAnswered({ path, track: null })
      })
    return () => asked.abort()
  }, [path])

  return path !== null && answered?.path === path
    ? { track: answered.track, waiting: false }
    : { track: null, waiting: path !== null }
}

export { useJumpTrack }
