import { liveEventSchema } from '@skydock/scripts'
import type { ProxyFact, TandemFact } from '@skydock/scripts'
import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { routingEngine } from '../helpers/routing'

/* what is being done to a file right now, and how far through it */
type LiveFile = { work: 'process' | 'proxy'; percent: number }

/* What is happening to the files as it happens, heard over one stream the server keeps open — so a
   file being processed, or a proxy being made, shows how far along it is with nobody asking. The
   browser reconnects by itself, and on connecting the server first says what is already under way.

   Only ever a hint for the eyes. What a file is comes from the board's own answers; the one thing
   taken from here is a proxy that has just landed, which is a fact the server read off the disk and
   sent with the event, so the clip is flagged the moment it is ready. */
const useLiveProgress = (
  onProxies: Dispatch<SetStateAction<Record<string, ProxyFact>>>,
  /* what a tandem's folder holds, when it changed by the editor's hand — a film just rendered */
  onTandems: Dispatch<SetStateAction<Record<string, TandemFact>>>,
  onNote: Dispatch<SetStateAction<string | null>>
) => {
  const [files, setFiles] = useState<Record<string, LiveFile>>({})

  useEffect(() => {
    const source = new EventSource(routingEngine.href({ url: '/api/events' }))
    source.onmessage = (message) => {
      let raw: unknown
      try {
        raw = JSON.parse(String(message.data))
      } catch {
        return
      }
      const parsed = liveEventSchema.safeParse(raw)
      if (!parsed.success) return
      const event = parsed.data
      if (event.kind === 'tandem') {
        onTandems((now) => ({ ...now, [event.groupId]: event.fact }))
        if (event.rendered) onNote(`${event.who}’s film is rendered — ready to upload`)
        return
      }
      if (event.kind === 'file') {
        setFiles((now) => ({
          ...now,
          [event.fileId]: { work: event.work, percent: event.percent }
        }))
        return
      }
      setFiles((now) => {
        const { [event.fileId]: _ended, ...rest } = now
        return rest
      })
      const landed = event.proxy
      if (landed) onProxies((now) => ({ ...now, [landed.path]: landed.fact }))
    }
    return () => source.close()
  }, [onProxies, onTandems, onNote])

  return files
}

export { useLiveProgress }
export type { LiveFile }
