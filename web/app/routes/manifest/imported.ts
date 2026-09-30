import { recordTransfer } from '@skydock/scripts'
import type { ImportOutcome, TransferItem } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* What a drop came to, kept so the panel that showed it going can be opened again to see (RULES,
   Transfers): each file that came in, one that joined a second jump, one left where it was, one that
   could not be added — and how many were here already. The sizes are not said to the server with the
   outcome, so they are not kept. */
const keepDrop = (drop: ImportOutcome, outputDir: string) => {
  const items: TransferItem[] = [
    ...drop.added.map((name): TransferItem => ({ name, size: 0, result: 'done' })),
    ...drop.moved.map(({ name, from }): TransferItem => ({
      name,
      size: 0,
      result: 'done',
      note: from
    })),
    ...drop.kept.map((name): TransferItem => ({ name, size: 0, result: 'skipped' })),
    ...drop.failed.map((name): TransferItem => ({ name, size: 0, result: 'failed' }))
  ]
  if (items.length === 0 && drop.there === 0) return
  try {
    recordTransfer(
      {
        kind: 'import',
        label: drop.where,
        state: drop.failed.length > 0 && items.length === drop.failed.length ? 'failed' : 'done',
        items,
        passedOver: drop.there
      },
      outputDir
    )
  } catch {
    /* a history that cannot be written is no reason to fail the drop it is the history of */
  }
}

/* files were just added — from the computer, one request each, or off a camera as each lands: the
   board looks again, and hears how a drop went when there is a drop to hear about */
const imported: Intent = ({ data, manifest, outputDir }) => {
  if (data.imported) keepDrop(data.imported, outputDir)
  return { ...boardAnswer(manifest), imported: data.imported }
}

export { imported }
