import { z } from 'zod'
import { proxyFactSchema, montageFactSchema } from './boardAnswer'

/* What is happening to a file right now, said as it happens so the board can show it without
   asking. These are for the eyes only: what a file *is* — processed, proxied, uploaded — stays a
   fact read off the disk and the records (RULES, Principles), so an event that never arrives costs
   a bar that lags and never a wrong status. */
/* The work done to one file that is shown on it while it runs: copying it for handing over, making
   its small copy for playing, and finding where the jump is in it. */
const workSchema = z.enum(['process', 'proxy', 'moments'])

const liveEventSchema = z.discriminatedUnion('kind', [
  /* a file being worked on, and how far through it */
  z.object({
    kind: z.literal('file'),
    work: workSchema,
    fileId: z.string(),
    percent: z.number()
  }),
  /* the work on it ended, well or not — and for a proxy that landed, what the clip now plays */
  z.object({
    kind: z.literal('file-done'),
    work: workSchema,
    fileId: z.string(),
    ok: z.boolean(),
    proxy: z.object({ path: z.string(), fact: proxyFactSchema }).optional()
  }),
  /* What a montage's folder holds, looked at again because it changed under nobody's hand here — the
     editor saved a project, or finished rendering the film. `rendered` is a film that was not there,
     or was not this one, the last time it was said. */
  z.object({
    kind: z.literal('montage'),
    groupId: z.string(),
    who: z.string(),
    fact: montageFactSchema,
    rendered: z.boolean()
  }),
  /* A camera plugged in and being copied off, by the name it is mounted under: how far through its
     files, how many were new and how many already here — and how it ended. */
  z.object({
    kind: z.literal('camera'),
    camera: z.string(),
    state: z.enum(['copying', 'done', 'gone', 'failed']),
    done: z.number(),
    total: z.number(),
    copied: z.number(),
    skipped: z.number(),
    reason: z.string().optional(),
    /* every file on the card, said once as the copy starts */
    files: z.array(z.object({ name: z.string(), size: z.number() })).optional(),
    /* how the file just finished went */
    last: z.enum(['copied', 'skipped']).optional(),
    /* how far through the file being copied now, between 0 and 1 */
    part: z.number().optional(),
    /* how every finished file went, in order — kept for a board that starts listening mid-copy */
    outcomes: z.array(z.enum(['copied', 'skipped'])).optional()
  }),
  /* the room left on the output folder's disk, said when it changes enough to matter */
  z.object({
    kind: z.literal('disk'),
    free: z.number(),
    total: z.number(),
    level: z.enum(['ok', 'low', 'full'])
  }),
  /* One file being copied in from the computer, while it is. A drop of one long clip is minutes of
     nothing to look at otherwise: the board has the list and the count from the start, and this is
     how far through the one being copied it is. Named by a token the page chose before it sent
     anything, because a file has no id here until its bytes have landed and been read. */
  z.object({
    kind: z.literal('import'),
    token: z.string(),
    done: z.number(),
    total: z.number(),
    /* copying it in, then reading what came — the date it was taken, the name it will be known by.
       The reading is quick beside the copy and says nothing about how long it has left, but it is
       not nothing, and a bar that sat full with no word would look stuck. `done` ends it. */
    phase: z.enum(['copying', 'reading', 'done'])
  }),
  /* The cameras plugged in right now, said each time one comes or goes. `over` is how each one
     hands its files over: a drive the machine mounted, or MTP — a camera with no drive to offer,
     which is read a request at a time and is therefore slower than a card in a reader. */
  z.object({
    kind: z.literal('cameras'),
    mounted: z.array(
      z.object({ camera: z.string(), mount: z.string(), over: z.enum(['drive', 'mtp']) })
    )
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
  if (event.kind === 'file') underWay.set(`${event.work}:${event.fileId}`, event)
  if (event.kind === 'file-done') underWay.delete(`${event.work}:${event.fileId}`)
  /* whoever starts listening hears which cameras are plugged in, not only the next change */
  if (event.kind === 'cameras') underWay.set('cameras', event)
  if (event.kind === 'disk') underWay.set('disk', event)
  /* a copy under way is heard by a board opened in the middle of it; one that ended is not */
  if (event.kind === 'import') {
    if (event.phase === 'done') underWay.delete(`import:${event.token}`)
    else underWay.set(`import:${event.token}`, event)
  }
  /* a copy's list is said once, so what is kept for a late listener carries it on, with how every
     file so far went */
  if (event.kind === 'camera') {
    const key = `camera:${event.camera}`
    const before = underWay.get(key)
    const kept = before?.kind === 'camera' && !event.files ? before : undefined
    if (event.state === 'copying')
      underWay.set(key, {
        ...event,
        files: event.files ?? kept?.files,
        outcomes: [...(kept?.outcomes ?? []), ...(event.last ? [event.last] : [])]
      })
    else underWay.delete(key)
  }
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
const following = (work: z.infer<typeof workSchema>, fileId: string | undefined) => {
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
