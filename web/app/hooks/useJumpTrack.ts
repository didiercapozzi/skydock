import { jumpTrackSchema } from '@skydock/scripts'
import type { JumpTrack } from '@skydock/scripts'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { getTrackUrl } from '../components/utils'

const answerSchema = z.object({ track: jumpTrackSchema.nullable() })

/* The graph's numbers for the clip being looked at, fetched when it is opened and dropped when
   another is. They are read off the original with ffmpeg, which takes a moment, so the answer is
   kept with the clip it was asked about: one that arrives after the person has moved on belongs to
   a clip no longer on screen, and whether an answer is still being waited for is simply whether the
   one in hand is about the clip in hand.

   A clip whose camera measured nothing answers with nothing, and that is an answer worth keeping —
   it is what the graph says plainly instead of drawing an empty frame. */
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
