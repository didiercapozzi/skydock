import { ensureNasSession, inJob, saveManifest, messageOf } from '@skydock/scripts'
import { bringBack } from '../../../../packages/skydock-scripts/src/bringBack'
import { boardAnswer } from '../../helpers/manifest'
import { connectFirst } from './change'
import type { Intent } from './change'

/* One file fetched back off the storage, for footage this machine no longer holds: freeing deleted
   the original once the storage was proved to have it, and this is the way back (RULES, Freeing
   space). */

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
  if (!session) return refuse(connectFirst())
  /* said as it goes, so the corner shows it live; and kept when it ends, so the transfers can be opened to
     see it (RULES, Transfers) */
  try {
    const { board, ...back } = await inJob(
      {
        type: 'bring',
        label: '',
        total: 1,
        record: { kind: 'bring', outputDir, to: 'this machine' }
      },
      async (bringing) => {
        const done = await bringBack({
          manifest,
          session,
          fileId,
          latest,
          onStart: (name, size) => {
            bringing.rows([{ key: fileId, name, size }])
            bringing.row({ key: fileId, at: 'now', part: 0 })
          },
          onBytes: (landed, total) =>
            bringing.row({
              key: fileId,
              at: 'now',
              part: total > 0 ? Math.min(1, landed / total) : 0
            })
        })
        bringing.row({ key: fileId, at: 'done', part: 1 })
        bringing.step()
        return done
      }
    )
    saveManifest(manifestPath, board)
    return { ...boardAnswer(board), broughtBack: back }
  } catch (e) {
    return refuse(messageOf(e))
  }
}

export { bringBackIntent }
