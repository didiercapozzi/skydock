import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'
import { jsonText } from './lib/json'
import { getStatusDir } from './utils'

/* What was sent, copied in or copied off, kept after it is done (RULES, Transfers): an upload to the
   storage, a drop from the computer, a camera copied off — each with what it was of, when it ended,
   how it ended and every item it did something to. The panel that shows a transfer while it goes is
   gone when it is done; this is what lets it be opened again to see what happened. Kept on this
   machine, in the same folder as an upload's progress, so it is there after a reload or a restart. */

const transferItemSchema = z.object({
  name: z.string(),
  /* how big, when that was known; nothing where it was not */
  size: z.number(),
  /* the folder it went into, when it went anywhere */
  to: z.string().optional(),
  /* done; passed over as already there; failed; or left undone because the work was stopped */
  result: z.enum(['done', 'skipped', 'failed', 'left']),
  note: z.string().optional()
})

const transferSchema = z.object({
  id: z.string(),
  kind: z.enum(['upload', 'import', 'camera', 'bring']),
  /* what it was of, named as the board named it while it went */
  label: z.string(),
  /* when it ended, in seconds */
  at: z.number(),
  state: z.enum(['done', 'failed', 'cancelled']),
  /* what stopped it, when something did */
  reason: z.string().optional(),
  items: z.array(transferItemSchema),
  /* how many more were already there, and are not listed */
  passedOver: z.number().optional(),
  /* how many more did something and are not listed either, there being too many to keep */
  more: z.number().optional()
})

const transfersFileSchema = z.object({ transfers: z.array(transferSchema) })

type Transfer = z.infer<typeof transferSchema>
type TransferItem = z.infer<typeof transferItemSchema>
type NewTransfer = Omit<Transfer, 'id' | 'at'>

/* the transfers kept, the newest first; and the items kept of each — a card copied off or a drop of a
   folder can be thousands of files, and what matters is what happened to them, not a list as long */
const KEPT = 30
const ITEMS_KEPT = 400

const getTransfersPath = (outputDir?: string) =>
  path.join(getStatusDir(outputDir), 'transfers.json')

const readTransfers = (outputDir?: string) => {
  try {
    const parsed = jsonText
      .pipe(transfersFileSchema)
      .safeParse(fs.readFileSync(getTransfersPath(outputDir), 'utf-8'))
    return parsed.success ? parsed.data.transfers : []
  } catch {
    return []
  }
}

/* What is kept of the items: everything that did something, then as many of the ones passed over as
   there is room for — the rest are counted, never dropped without saying so. */
const fitted = (items: TransferItem[], passedOver: number) => {
  if (items.length <= ITEMS_KEPT) return { items, passedOver, more: 0 }
  const passed = items.filter((item) => item.result === 'skipped')
  const active = items.filter((item) => item.result !== 'skipped')
  const room = Math.max(0, ITEMS_KEPT - active.length)
  return {
    items: [...active.slice(0, ITEMS_KEPT), ...passed.slice(0, room)],
    passedOver: passedOver + passed.length - Math.min(passed.length, room),
    more: Math.max(0, active.length - ITEMS_KEPT)
  }
}

const recordTransfer = (transfer: NewTransfer, outputDir?: string) => {
  const { items, passedOver, more } = fitted(transfer.items, transfer.passedOver ?? 0)
  const made: Transfer = {
    ...transfer,
    id: crypto.randomUUID(),
    at: Math.floor(Date.now() / 1000),
    items,
    ...(passedOver > 0 ? { passedOver } : {}),
    ...(more > 0 ? { more } : {})
  }
  const target = getTransfersPath(outputDir)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  writeJsonAtomic(target, { transfers: [made, ...readTransfers(outputDir)].slice(0, KEPT) })
  return made
}

/* One transfer forgotten, the others kept: only what is kept about what happened, as with clearing. */
const removeTransfer = (id: string, outputDir?: string) => {
  const kept = readTransfers(outputDir).filter((transfer) => transfer.id !== id)
  if (kept.length === 0) clearTransfers(outputDir)
  else writeJsonAtomic(getTransfersPath(outputDir), { transfers: kept })
}

const clearTransfers = (outputDir?: string) => {
  const target = getTransfersPath(outputDir)
  if (fs.existsSync(target)) fs.unlinkSync(target)
}

export {
  clearTransfers,
  getTransfersPath,
  ITEMS_KEPT,
  KEPT,
  readTransfers,
  recordTransfer,
  removeTransfer,
  transfersFileSchema
}
export type { Transfer, TransferItem }
