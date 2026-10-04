import { job } from './live'

/* A drop from the computer is many requests — one for each file — and one task: the corner shows the
   whole list from the first byte and counts it down. The page says what the drop is made of before the
   first file is sent, each file's request says which one it is, and the page says when it is over; this
   is where the one job in between is kept. A page that goes away without saying is not waited for
   ever: a drop that has been silent for two minutes failed, and says so. */

type Drop = { running: ReturnType<typeof job>; timer: ReturnType<typeof setTimeout> }

declare global {
  var skydockDrops: Map<string, Drop> | undefined
}

const drops = () => (globalThis.skydockDrops ??= new Map<string, Drop>())

const SILENT_FOR_MS = 120_000

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

/* the drop is made of these, named for where it is going */
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
  drops().set(batch, { running, timer: setTimeout(() => {}, 0) })
  touch(batch)
}

/* what is happening to one file of it: begun, moved on, or how it ended */
const dropRow = (
  batch: string | undefined,
  patch: Parameters<ReturnType<typeof job>['row']>[0]
) => {
  if (!batch) return
  const running = touch(batch)
  running?.row(patch)
  if (running && (patch.at === 'done' || patch.at === 'skipped' || patch.at === 'failed'))
    running.step()
}

/* the page says it is over */
const endDrop = (batch: string) => {
  const drop = drops().get(batch)
  if (!drop) return
  clearTimeout(drop.timer)
  drops().delete(batch)
  drop.running.finish()
}

export { beginDrop, dropRow, endDrop }
