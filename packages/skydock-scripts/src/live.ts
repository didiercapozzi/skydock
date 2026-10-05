import * as crypto from 'node:crypto'
import { z } from 'zod'
import { proxyFactSchema, montageFactSchema } from './boardAnswer'
import { recordTransfer } from './transfers'
import type { Transfer } from './transfers'
import { jumpMomentsSchema } from './types'

/* What is happening to a file right now, said as it happens so the board can show it without
   asking. These are for the eyes only: what a file *is* — processed, proxied, uploaded — stays a
   fact read off the disk and the records (RULES, Principles), so an event that never arrives costs
   a bar that lags and never a wrong status. */
/* The work done to one file that is shown on it while it runs: copying it for handing over, making
   its small copy for playing, and finding where the jump is in it. */
const workSchema = z.enum(['process', 'proxy', 'moments'])

/* the tasks that report as jobs */
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

/* One thing a job is doing to a file, or to a step: where it has got to, how far through it is, and
   — in a word the board turns into its own language — what is happening to it. `key` tells it from the
   others when two share a name. */
const jobRowSchema = z.object({
  key: z.string(),
  name: z.string(),
  size: z.number(),
  at: z.enum(['later', 'now', 'done', 'skipped', 'failed']),
  /* between 0 and 1, for the one under way */
  part: z.number().optional(),
  phase: z.string().optional(),
  /* what is worth saying of it when it did not go as asked — why it stayed */
  note: z.string().optional(),
  /* where it is going, when it goes somewhere — a folder on the storage */
  to: z.string().optional()
})

/* how a task ended, when the board has to look again at what it changed */
const jobOutcomeSchema = z.object({
  state: z.enum(['done', 'gone', 'stopped', 'failed']),
  copied: z.number(),
  skipped: z.number(),
  unreadable: z.array(z.string()).optional()
})

/* what is said of one row: its key, and whatever of it changed */
const jobRowPatchSchema = jobRowSchema.partial().required({ key: true })

const liveEventSchema = z.discriminatedUnion('kind', [
  /* a file being worked on, and how far through it */
  z.object({
    kind: z.literal('file'),
    work: workSchema,
    fileId: z.string(),
    percent: z.number()
  }),
  /* the work on it ended, well or not — and for a proxy that landed, what the clip now plays; for
     the jump found in it, where it is, or `null` for a clip that shows none */
  z.object({
    kind: z.literal('file-done'),
    work: workSchema,
    fileId: z.string(),
    ok: z.boolean(),
    proxy: z.object({ path: z.string(), fact: proxyFactSchema }).optional(),
    moments: jumpMomentsSchema.nullable().optional()
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
  /* The board's own record (manifest.json and its groups) changed under nobody's hand here — another
     tab, a script, a hand edit, work done outside the page — and has stopped changing. `stamp` says
     which state it is, so a board that has already adopted it can tell. */
  z.object({
    kind: z.literal('board'),
    stamp: z.string()
  }),
  /* the room left on the output folder's disk, said when it changes enough to matter */
  z.object({
    kind: z.literal('disk'),
    free: z.number(),
    total: z.number(),
    level: z.enum(['ok', 'low', 'full'])
  }),
  /* A task with no file of its own to show — freeing a montage, scanning, putting files back — said as it
     goes: what it is, how far through its steps, and the thing being done now. It is the one shape every
     such task reports in, and the one panel in the corner draws them all. */
  z.object({
    kind: z.literal('job'),
    id: z.string(),
    type: jobTypeSchema,
    /* what it is about — a passenger, a folder, a camera */
    label: z.string(),
    /* `checking` is proving something before anything is changed; `working` is changing it */
    stage: z.enum(['checking', 'working', 'done', 'failed']),
    done: z.number(),
    total: z.number(),
    /* the file or step being done now, when there is one */
    name: z.string().optional(),
    reason: z.string().optional(),
    /* which part of its work it is at, in a word the board turns into its own language — an upload zips,
       then checks what the storage holds, then sends */
    phase: z.string().optional(),
    /* every file or step it is made of, said whole once — and then one at a time, as each changes */
    rows: z.array(jobRowSchema).optional(),
    row: jobRowPatchSchema.optional(),
    /* how it ended, for the board to look again at what it changed: a camera copied off says how many came
       and how many were here already, and whether it was stopped or the card was taken out */
    outcome: jobOutcomeSchema.optional()
  }),
  /* The cameras plugged in right now, said each time one comes or goes. `over` is how each one
     hands its files over: a drive the machine mounted, or MTP — a camera with no drive to offer,
     which is read a request at a time and is therefore slower than a card in a reader. */
  z.object({
    kind: z.literal('cameras'),
    mounted: z.array(
      z.object({
        camera: z.string(),
        mount: z.string(),
        over: z.enum(['drive', 'mtp']),
        /* which camera it is, across plugs: the disk's own id where there is one, else its name */
        key: z.string().default(''),
        /* whether this machine has met it, and copies what is new on it by itself */
        known: z.boolean().default(false),
        auto: z.boolean().default(false),
        /* how many files on it are not here yet, once looked at; none where it cannot be counted */
        fresh: z.number().nullable().default(null)
      })
    ),
    /* every camera this machine has met, plugged in or not, and when each was last there (seconds) */
    known: z
      .array(
        z.object({ key: z.string(), name: z.string(), auto: z.boolean(), lastSeen: z.number() })
      )
      .default([]),
    /* the cameras plugged in that have never been met: waiting to be asked about, by where they are mounted */
    prompts: z.array(z.string()).default([])
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

type JobRow = z.infer<typeof jobRowSchema>
type JobRowPatch = z.infer<typeof jobRowPatchSchema>

/* a row changed: the one with its key takes what was said, and one never mentioned before joins */
const mergeRow = (rows: JobRow[], patch: JobRowPatch) =>
  rows.some((row) => row.key === patch.key)
    ? rows.map((row) => (row.key === patch.key ? { ...row, ...patch } : row))
    : [...rows, { name: patch.key, size: 0, at: 'later' as const, ...patch }]

const bus = () => (globalThis.skydockLive ??= { listeners: new Set(), underWay: new Map() })

const publish = (event: LiveEvent) => {
  const { listeners, underWay } = bus()
  if (event.kind === 'file') underWay.set(`${event.work}:${event.fileId}`, event)
  if (event.kind === 'file-done') underWay.delete(`${event.work}:${event.fileId}`)
  /* whoever starts listening hears which cameras are plugged in, not only the next change */
  if (event.kind === 'cameras') underWay.set('cameras', event)
  if (event.kind === 'disk') underWay.set('disk', event)
  /* a job under way is heard by a board opened in the middle of it; one that ended is not */
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
   never backward, never the same figure twice, and two percent at a time, which moves a bar as
   visibly as one and is half the telling — and how it ended. */
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

/* One task's steps, said from start to end: it begins, each step forward as it comes, and how it ended.
   `total` is the number of steps and may be raised as they become known. */
const job = ({
  type,
  label,
  total,
  record
}: {
  type: z.infer<typeof jobTypeSchema>
  label: string
  total: number
  /* kept with the other transfers when it ends (RULES, Transfers): what kind it is filed as, the folder
     the history lives in, where what it handled went, when it went anywhere, and whether a task that did
     nothing and failed at nothing is left out */
  record?: {
    kind: Transfer['kind']
    outputDir?: string
    to?: string
    label?: string
    quietIfIdle?: boolean
    /* what was here already is counted and not listed */
    passOver?: boolean
  }
}) => {
  const id = crypto.randomUUID()
  let done = 0
  let steps = total
  /* everything it was made of, as it stands — what the history is written from */
  let known: JobRow[] = []
  let stage: 'checking' | 'working' = 'working'
  /* which part of its work it is at, kept so that every later word still says it */
  let phase: string | undefined
  /* how far each row was last said to be, so a bar moves a step at a time and not on every chunk */
  const told = new Map<string, number>()
  const keep = (state: 'done' | 'failed' | 'cancelled', reason?: string) => {
    if (!record) return
    /* what did something is listed; what was here already is only counted — unless it has something to say */
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
    } catch {
      /* a history that cannot be written is no reason to fail what it is the history of */
    }
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
    /* proving, naming what is looked at */
    checking: (name?: string) => say('checking', { name }),
    /* it has moved on to another part of its work, naming what is done now when there is something */
    phase: (phase: string, name?: string) => say(stage, { phase, name }),
    /* changing, naming what is done now */
    working: (name?: string) => say('working', { name }),
    /* one step is finished */
    step: () => {
      done++
    },
    /* how many steps are finished, when that is counted elsewhere */
    at: (steps_done: number) => {
      done = steps_done
    },
    expect: (more: number) => {
      steps = more
    },
    /* everything it is made of, said once, so the list is there before the first is begun */
    rows: (all: Array<Pick<JobRow, 'key' | 'name' | 'size'> & Partial<JobRow>>) =>
      say(stage, { rows: all.map((one) => ({ at: 'later' as const, ...one })) }),
    /* one of them changed: begun, moved on, finished or failed */
    row: (patch: JobRowPatch) => {
      if (patch.part !== undefined && patch.at === 'now' && !patch.phase) {
        const last = told.get(patch.key) ?? -1
        if (patch.part < 1 && last >= 0 && patch.part < last + STEP / 100) return
        told.set(patch.key, patch.part)
      }
      say(stage, { row: patch })
    },
    /* it ended; when the board has to look again at what it changed, how it came out is said with it */
    finish: (ended?: { outcome?: z.infer<typeof jobOutcomeSchema>; reason?: string }) => {
      done = steps
      say('done', ended)
    },
    /* what was under way when it failed did not get done, and says so */
    fail: (reason: string, outcome?: z.infer<typeof jobOutcomeSchema>) =>
      say('failed', {
        reason,
        ...(outcome ? { outcome } : {}),
        rows: known.map((row) => (row.at === 'now' ? { ...row, at: 'failed' as const } : row))
      })
  }
}

/* A task run as a job: it ends well when the work returns and says why when it throws, so no task has to
   remember to say either. */
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
