import { job } from './live'

type Drop = {
  running: ReturnType<typeof job>
  timer: ReturnType<typeof setTimeout>
  waiting: Set<string>
  left: Set<string>
  going: Map<string, AbortController>
  stopped: boolean
  copied: number
  skipped: number
}

declare global {
  var skydockDrops: Map<string, Drop> | undefined
}

const drops = () => (globalThis.skydockDrops ??= new Map<string, Drop>())

const SILENT_FOR_MS = 120_000

const CANCELLED = 'Cancelled'

const touch = (batch: string) => {
  const drop = drops().get(batch)
  if (!drop) return undefined
  clearTimeout(drop.timer)
  drop.timer = setTimeout(() => {
    drop.running.fail('The drop was cut off.')
    drops().delete(batch)
  }, SILENT_FOR_MS)
  drop.timer.unref()
  return drop.running
}

const beginDrop = ({
  batch,
  where,
  files,
  outputDir
}: {
  batch: string
  where: string
  files: Array<{ key: string; name: string; size: number }>
  outputDir?: string
}) => {
  const running = job({
    type: 'import',
    label: where,
    total: files.length,
    record: { kind: 'import', outputDir, passOver: true }
  })
  running.rows(files)
  drops().set(batch, {
    running,
    timer: setTimeout(() => {}, 0),
    waiting: new Set(files.map((file) => file.key)),
    left: new Set(),
    going: new Map(),
    stopped: false,
    copied: 0,
    skipped: 0
  })
  touch(batch)
  return running.id
}

const dropRow = (
  batch: string | undefined,
  patch: Parameters<ReturnType<typeof job>['row']>[0]
) => {
  if (!batch) return
  const running = touch(batch)
  running?.row(patch)
  if (running && (patch.at === 'done' || patch.at === 'skipped' || patch.at === 'failed')) {
    const drop = drops().get(batch)
    if (drop && drop.waiting.delete(patch.key)) {
      if (patch.at === 'done') drop.copied++
      else if (patch.at === 'skipped' && patch.phase !== 'cancelled') drop.skipped++
    }
    running.step()
  }
}

const byJob = (jobId: string) => [...drops()].find(([, drop]) => drop.running.id === jobId)

const leftRow = (batch: string, key: string) =>
  dropRow(batch, { key, at: 'skipped', phase: 'cancelled', note: CANCELLED })

/* Whether a file of the drop is still wanted, said before it is sent: a whole drop cancelled and a file
   cancelled on its own are both answered here, so nothing of them is carried over for nothing. */
const wanted = (batch: string, key: string) => {
  const drop = drops().get(batch)
  if (!drop) return { go: true, stopped: false }
  return { go: !drop.stopped && !drop.left.has(key), stopped: drop.stopped }
}

const goingDrop = (batch: string | undefined, key: string | undefined) => {
  const drop = batch ? drops().get(batch) : undefined
  if (!drop || !key) return undefined
  const stopper = new AbortController()
  drop.going.set(key, stopper)
  return {
    signal: stopper.signal,
    done: () => {
      drop.going.delete(key)
    }
  }
}

const stopDropFile = (jobId: string, key: string) => {
  const found = byJob(jobId)
  if (!found) return false
  const [batch, drop] = found
  if (!drop.waiting.has(key)) return false
  drop.left.add(key)
  const stopper = drop.going.get(key)
  if (stopper) stopper.abort()
  else leftRow(batch, key)
  return true
}

const stopDrop = (jobId: string) => {
  const found = byJob(jobId)
  if (!found) return false
  const [batch, drop] = found
  drop.stopped = true
  for (const key of [...drop.waiting]) {
    const stopper = drop.going.get(key)
    if (stopper) stopper.abort()
    else leftRow(batch, key)
  }
  return true
}

const endDrop = (batch: string) => {
  const drop = drops().get(batch)
  if (!drop) return
  clearTimeout(drop.timer)
  drops().delete(batch)
  drop.running.finish(
    drop.stopped
      ? { outcome: { state: 'stopped', copied: drop.copied, skipped: drop.skipped } }
      : undefined
  )
}

export { beginDrop, dropRow, endDrop, goingDrop, leftRow, stopDrop, stopDropFile, wanted }
