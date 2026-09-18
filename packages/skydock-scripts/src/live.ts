import { z } from 'zod'
import { proxyFactSchema } from './boardAnswer'

/* What is happening to a file right now, said as it happens so the board can show it without
   asking. These are for the eyes only: what a file *is* — processed, proxied, uploaded — stays a
   fact read off the disk and the records (RULES, Principles), so an event that never arrives costs
   a bar that lags and never a wrong status. */
const liveEventSchema = z.discriminatedUnion('kind', [
  /* a file being worked on, and how far through it */
  z.object({
    kind: z.literal('file'),
    work: z.enum(['process', 'proxy']),
    fileId: z.string(),
    percent: z.number()
  }),
  /* the work on it ended, well or not — and for a proxy that landed, what the clip now plays */
  z.object({
    kind: z.literal('file-done'),
    work: z.enum(['process', 'proxy']),
    fileId: z.string(),
    ok: z.boolean(),
    proxy: z.object({ path: z.string(), fact: proxyFactSchema }).optional()
  })
])

type LiveEvent = z.infer<typeof liveEventSchema>

type Bus = {
  listeners: Set<(event: LiveEvent) => void>
  /* what is under way, by work and file, for whoever starts listening in the middle of it */
  underWay: Map<string, LiveEvent>
}

/* One bus for the whole process, kept on the global object rather than in this module: the
   development server loads a module afresh when a file is saved, and work started by the old copy
   has to be heard by whoever subscribes through the new one. */
declare global {
  var skydockLive: Bus | undefined
}

const bus = () => (globalThis.skydockLive ??= { listeners: new Set(), underWay: new Map() })

const publish = (event: LiveEvent) => {
  const { listeners, underWay } = bus()
  const key = `${event.work}:${event.fileId}`
  if (event.kind === 'file') underWay.set(key, event)
  else underWay.delete(key)
  for (const listener of listeners) listener(event)
}

/* Hears everything from now on, after first hearing what is already under way — a page opened in
   the middle of a run shows it where it is, not from the next file on. */
const subscribe = (listener: (event: LiveEvent) => void) => {
  const { listeners, underWay } = bus()
  for (const event of underWay.values()) listener(event)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/* One file's work, said from start to end: at once that it began, each step forward as it comes —
   never backward, never the same figure twice — and how it ended. */
const following = (work: 'process' | 'proxy', fileId: string | undefined) => {
  let last = -1
  const at = (percent: number) => {
    if (!fileId || percent <= last) return
    last = percent
    publish({ kind: 'file', work, fileId, percent })
  }
  at(0)
  return {
    at,
    done: (ok: boolean, proxy?: { path: string; fact: z.infer<typeof proxyFactSchema> }) => {
      if (fileId) publish({ kind: 'file-done', work, fileId, ok, proxy })
    }
  }
}

export { following, liveEventSchema, publish, subscribe }
export type { LiveEvent }
