import * as crypto from 'node:crypto'
import { z } from 'zod'
import { proxyFactSchema, montageFactSchema } from './boardAnswer'
import { recordTransfer } from './transfers'
import type { Transfer } from './transfers'
import { jumpMomentsSchema } from './types'

const workSchema = z.enum(['process', 'proxy', 'moments'])

const jobTypeSchema = z.enum([
  'free',
  'free-place',
  'scan',
  'copy-back',
  'bin',
  'trash',
  'template',
  'bring',
  'camera-delete',
  'import',
  'proxy',
  'moments',
  'process',
  'camera-copy',
  'upload'
])

const jobRowSchema = z.object({
  key: z.string(),
  name: z.string(),
  size: z.number(),
  at: z.enum(['later', 'now', 'done', 'skipped', 'failed']),
  part: z.number().optional(),
  phase: z.string().optional(),
  note: z.string().optional(),
  to: z.string().optional()
})

const jobOutcomeSchema = z.object({
  state: z.enum(['done', 'gone', 'stopped', 'failed']),
  copied: z.number(),
  skipped: z.number(),
  unreadable: z.array(z.string()).optional()
})

const jobRowPatchSchema = jobRowSchema.partial().required({ key: true })

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
    kind: z.literal('board'),
    stamp: z.string()
  }),
  z.object({
    kind: z.literal('disk'),
    free: z.number(),
    total: z.number(),
    level: z.enum(['ok', 'low', 'full'])
  }),
  z.object({
    kind: z.literal('job'),
    id: z.string(),
    type: jobTypeSchema,
    label: z.string(),
    stage: z.enum(['checking', 'working', 'done', 'failed']),
    done: z.number(),
    total: z.number(),
    name: z.string().optional(),
    reason: z.string().optional(),
    phase: z.string().optional(),
    rows: z.array(jobRowSchema).optional(),
    row: jobRowPatchSchema.optional(),
    outcome: jobOutcomeSchema.optional()
  }),
  z.object({
    kind: z.literal('cameras'),
    mounted: z.array(
      z.object({
        camera: z.string(),
        mount: z.string(),
        over: z.enum(['drive', 'mtp']),
        key: z.string().default(''),
        known: z.boolean().default(false),
        auto: z.boolean().default(false),
        fresh: z.number().nullable().default(null)
      })
    ),
    known: z
      .array(
        z.object({ key: z.string(), name: z.string(), auto: z.boolean(), lastSeen: z.number() })
      )
      .default([]),
    prompts: z.array(z.string()).default([])
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

type JobRow = z.infer<typeof jobRowSchema>
type JobRowPatch = z.infer<typeof jobRowPatchSchema>

const mergeRow = (rows: JobRow[], patch: JobRowPatch) =>
  rows.some((row) => row.key === patch.key)
    ? rows.map((row) => (row.key === patch.key ? { ...row, ...patch } : row))
    : [...rows, { name: patch.key, size: 0, at: 'later' as const, ...patch }]

const bus = () => (globalThis.skydockLive ??= { listeners: new Set(), underWay: new Map() })

const publish = (event: LiveEvent) => {
  const { listeners, underWay } = bus()
  if (event.kind === 'file') underWay.set(`${event.work}:${event.fileId}`, event)
  if (event.kind === 'file-done') underWay.delete(`${event.work}:${event.fileId}`)
  if (event.kind === 'cameras') underWay.set('cameras', event)
  if (event.kind === 'disk') underWay.set('disk', event)
  if (event.kind === 'job') {
    const key = `job:${event.id}`
    if (event.stage === 'done' || event.stage === 'failed') underWay.delete(key)
    else {
      const before = underWay.get(key)
      const known = before?.kind === 'job' ? (before.rows ?? []) : []
      underWay.set(key, {
        ...event,
        row: undefined,
        rows: event.rows ?? (event.row ? mergeRow(known, event.row) : known)
      })
    }
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

const job = ({
  type,
  label,
  total,
  record
}: {
  type: z.infer<typeof jobTypeSchema>
  label: string
  total: number
  record?: {
    kind: Transfer['kind']
    outputDir?: string
    to?: string
    label?: string
    quietIfIdle?: boolean
    passOver?: boolean
  }
}) => {
  const id = crypto.randomUUID()
  let done = 0
  let steps = total
  let known: JobRow[] = []
  let stage: 'checking' | 'working' = 'working'
  let phase: string | undefined
  const told = new Map<string, number>()
  const keep = (state: 'done' | 'failed' | 'cancelled', reason?: string) => {
    if (!record) return
    const passed = record.passOver ? known.filter((row) => row.at === 'skipped' && !row.note) : []
    const listed = known.filter((row) => !passed.includes(row))
    if (record.quietIfIdle && state === 'done' && !listed.some((row) => row.at !== 'later')) return
    try {
      recordTransfer(
        {
          kind: record.kind,
          label: record.label ?? known[0]?.name ?? label,
          state,
          ...(reason ? { reason } : {}),
          items: listed.map((row) => ({
            name: row.name,
            size: row.size,
            ...(row.note ? { note: row.note } : {}),
            ...(row.to ? { to: row.to } : record.to && row.at === 'done' ? { to: record.to } : {}),
            result:
              row.at === 'done'
                ? ('done' as const)
                : row.at === 'skipped'
                  ? ('skipped' as const)
                  : row.at === 'failed'
                    ? ('failed' as const)
                    : ('left' as const)
          })),
          ...(passed.length > 0 ? { passedOver: passed.length } : {})
        },
        record.outputDir
      )
    } catch {}
  }
  const say = (
    now: 'checking' | 'working' | 'done' | 'failed',
    more: {
      name?: string
      reason?: string
      phase?: string
      rows?: JobRow[]
      row?: JobRowPatch
      outcome?: z.infer<typeof jobOutcomeSchema>
    } = {}
  ) => {
    if (now === 'checking' || now === 'working') stage = now
    if (more.phase) phase = more.phase
    if (more.rows) known = more.rows
    if (more.row) known = mergeRow(known, more.row)
    if (record && (now === 'done' || now === 'failed'))
      keep(
        now === 'failed' ? 'failed' : more.outcome?.state === 'stopped' ? 'cancelled' : 'done',
        more.reason
      )
    publish({
      kind: 'job',
      id,
      type,
      label,
      stage: now,
      done: Math.min(done, steps),
      total: steps,
      ...(more.name ? { name: more.name } : {}),
      ...(more.reason ? { reason: more.reason } : {}),
      ...(phase ? { phase } : {}),
      ...(more.rows ? { rows: more.rows } : {}),
      ...(more.row ? { row: more.row } : {}),
      ...(more.outcome ? { outcome: more.outcome } : {})
    })
  }
  say('working')
  return {
    checking: (name?: string) => say('checking', { name }),
    phase: (phase: string, name?: string) => say(stage, { phase, name }),
    working: (name?: string) => say('working', { name }),
    step: () => {
      done++
    },
    at: (steps_done: number) => {
      done = steps_done
    },
    expect: (more: number) => {
      steps = more
    },
    rows: (all: Array<Pick<JobRow, 'key' | 'name' | 'size'> & Partial<JobRow>>) =>
      say(stage, { rows: all.map((one) => ({ at: 'later' as const, ...one })) }),
    row: (patch: JobRowPatch) => {
      if (patch.part !== undefined && patch.at === 'now' && !patch.phase) {
        const last = told.get(patch.key) ?? -1
        if (patch.part < 1 && last >= 0 && patch.part < last + STEP / 100) return
        told.set(patch.key, patch.part)
      }
      say(stage, { row: patch })
    },
    finish: (ended?: { outcome?: z.infer<typeof jobOutcomeSchema>; reason?: string }) => {
      done = steps
      say('done', ended)
    },
    fail: (reason: string, outcome?: z.infer<typeof jobOutcomeSchema>) =>
      say('failed', {
        reason,
        ...(outcome ? { outcome } : {}),
        rows: known.map((row) => (row.at === 'now' ? { ...row, at: 'failed' as const } : row))
      })
  }
}

const inJob = async <T>(
  start: Parameters<typeof job>[0],
  work: (running: ReturnType<typeof job>) => Promise<T>
) => {
  const running = job(start)
  try {
    const result = await work(running)
    running.finish()
    return result
  } catch (e) {
    running.fail(e instanceof Error ? e.message : String(e))
    throw e
  }
}

export { following, inJob, job, liveEventSchema, mergeRow, publish, subscribe }
export type { JobRow, LiveEvent }
