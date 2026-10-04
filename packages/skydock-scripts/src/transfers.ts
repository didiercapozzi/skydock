import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'
import { jsonText } from './lib/json'
import { getStatusDir } from './utils'

const transferItemSchema = z.object({
  name: z.string(),
  size: z.number(),
  to: z.string().optional(),
  result: z.enum(['done', 'skipped', 'failed', 'left']),
  note: z.string().optional()
})

const transferSchema = z.object({
  id: z.string(),
  kind: z.enum(['upload', 'import', 'camera', 'bring', 'delete']),
  label: z.string(),
  at: z.number(),
  state: z.enum(['done', 'failed', 'cancelled']),
  reason: z.string().optional(),
  items: z.array(transferItemSchema),
  passedOver: z.number().optional(),
  more: z.number().optional()
})

const transfersFileSchema = z.object({ transfers: z.array(transferSchema) })

type Transfer = z.infer<typeof transferSchema>
type TransferItem = z.infer<typeof transferItemSchema>
type NewTransfer = Omit<Transfer, 'id' | 'at'>

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
