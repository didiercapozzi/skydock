import { z } from 'zod'
import { proxyFactSchema, montageFactSchema } from './boardAnswer'
import { jumpMomentsSchema } from './types'

const workSchema = z.enum(['process', 'proxy', 'moments'])

const liveEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('file'),
    work: workSchema,
    fileId: z.string(),
    percent: z.number()
  }),
  z.object({
    kind: z.literal('file-done'),
    work: workSchema,
    fileId: z.string(),
    ok: z.boolean(),
    proxy: z.object({ path: z.string(), fact: proxyFactSchema }).optional(),
    moments: jumpMomentsSchema.nullable().optional()
  }),
  z.object({
    kind: z.literal('montage'),
    groupId: z.string(),
    who: z.string(),
    fact: montageFactSchema,
    rendered: z.boolean()
  }),
  z.object({
    kind: z.literal('camera'),
    camera: z.string(),
    state: z.enum(['copying', 'done', 'gone', 'failed', 'stopped']),
    done: z.number(),
    total: z.number(),
    copied: z.number(),
    skipped: z.number(),
    reason: z.string().optional(),
    files: z.array(z.object({ name: z.string(), size: z.number() })).optional(),
    last: z.enum(['copied', 'skipped', 'failed']).optional(),
    unreadable: z.array(z.string()).optional(),
    part: z.number().optional(),
    outcomes: z.array(z.enum(['copied', 'skipped', 'failed'])).optional()
  }),
  z.object({
    kind: z.literal('board'),
    stamp: z.string()
  }),
  z.object({
    kind: z.literal('bring'),
    fileId: z.string(),
    name: z.string(),
    state: z.enum(['going', 'done', 'failed']),
    part: z.number(),
    size: z.number(),
    reason: z.string().optional()
  }),
  z.object({
    kind: z.literal('disk'),
    free: z.number(),
    total: z.number(),
    level: z.enum(['ok', 'low', 'full'])
  }),
  z.object({
    kind: z.literal('import'),
    token: z.string(),
    done: z.number(),
    total: z.number(),
    phase: z.enum(['copying', 'reading', 'done'])
  }),
  z.object({
    kind: z.literal('camera-delete'),
    path: z.string(),
    stage: z.enum(['checking', 'checked', 'moving', 'done', 'failed']),
    part: z.number(),
    size: z.number().optional()
  }),
  z.object({
    kind: z.literal('free'),
    groupId: z.string(),
    label: z.string(),
    stage: z.enum(['checking', 'deleting', 'done', 'failed']),
    done: z.number(),
    total: z.number(),
    name: z.string().optional(),
    reason: z.string().optional()
  }),
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
  underWay: Map<string, LiveEvent>
}

declare global {
  var skydockLive: Bus | undefined
}

const bus = () => (globalThis.skydockLive ??= { listeners: new Set(), underWay: new Map() })

const publish = (event: LiveEvent) => {
  const { listeners, underWay } = bus()
  if (event.kind === 'file') underWay.set(`${event.work}:${event.fileId}`, event)
  if (event.kind === 'file-done') underWay.delete(`${event.work}:${event.fileId}`)
  if (event.kind === 'cameras') underWay.set('cameras', event)
  if (event.kind === 'disk') underWay.set('disk', event)
  if (event.kind === 'import') {
    if (event.phase === 'done') underWay.delete(`import:${event.token}`)
    else underWay.set(`import:${event.token}`, event)
  }
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

const subscribe = (listener: (event: LiveEvent) => void) => {
  const { listeners, underWay } = bus()
  for (const event of underWay.values()) listener(event)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const STEP = 2

const following = (work: z.infer<typeof workSchema>, fileId: string | undefined) => {
  let last = -1
  const at = (percent: number) => {
    if (!fileId || percent <= last || (last >= 0 && percent < last + STEP)) return
    last = percent
    publish({ kind: 'file', work, fileId, percent })
  }
  at(0)
  return {
    at,
    done: (
      ok: boolean,
      landed?: {
        proxy?: { path: string; fact: z.infer<typeof proxyFactSchema> }
        moments?: z.infer<typeof jumpMomentsSchema> | null
      }
    ) => {
      if (fileId) publish({ kind: 'file-done', work, fileId, ok, ...landed })
    }
  }
}

export { following, liveEventSchema, publish, subscribe }
export type { LiveEvent }
