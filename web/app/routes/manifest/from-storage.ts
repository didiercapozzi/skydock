import {
  ensureNasSession,
  publish,
  recordTransfer,
  saveManifest,
  messageOf
} from '@skydock/scripts'
import { bringBack } from '../../../../packages/skydock-scripts/src/bringBack'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* One file fetched back off the storage, for footage this machine no longer holds: freeing deleted
   the original once the storage was proved to have it, and this is the way back (RULES, Freeing
   space). */

const needsStorage = 'Connect the storage first.'

const bringBackIntent: Intent = async ({
  data,
  manifest,
  manifestPath,
  outputDir,
  refuse,
  latest
}) => {
  const fileId = data.fileIds?.[0]
  if (!fileId) return refuse('Nothing was asked for.')
  const session = await ensureNasSession()
  if (!session) return refuse(needsStorage)
  /* said as it goes, so the corner shows it live; and kept when it ends, so the transfers can be
     opened to see it (RULES, Transfers) */
  let name = ''
  let size = 0
  let lastPercent = -1
  const say = (state: 'going' | 'done' | 'failed', part: number, reason?: string) =>
    publish({
      kind: 'bring',
      fileId,
      name,
      state,
      part,
      size,
      ...(reason ? { reason } : {})
    })
  const keep = (state: 'done' | 'failed', reason?: string, to?: string) => {
    try {
      recordTransfer(
        {
          kind: 'bring',
          label: name || fileId,
          state,
          ...(reason ? { reason } : {}),
          items: name
            ? [{ name, size, ...(to ? { to } : {}), result: state === 'done' ? 'done' : 'failed' }]
            : []
        },
        outputDir
      )
    } catch {
      /* a history that cannot be written is no reason to fail what it is the history of */
    }
  }
  try {
    const { board, ...back } = await bringBack({
      manifest,
      session,
      fileId,
      latest,
      onStart: (filename, bytes) => {
        name = filename
        size = bytes
        say('going', 0)
      },
      onBytes: (landed, total) => {
        const part = total > 0 ? Math.min(1, landed / total) : 0
        /* whole percents only: a tick for every chunk would draw the corner for nothing */
        const percent = Math.floor(part * 100)
        if (percent === lastPercent) return
        lastPercent = percent
        say('going', part)
      }
    })
    saveManifest(manifestPath, board)
    say('done', 1)
    keep('done', undefined, 'this machine')
    return { ...boardAnswer(board), broughtBack: back }
  } catch (e) {
    const reason = messageOf(e)
    say('failed', 0, reason)
    keep('failed', reason)
    return refuse(reason)
  }
}

export { bringBackIntent }
