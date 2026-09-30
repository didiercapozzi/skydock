import { clearUploadProgress, recordTransfer, writeUploadProgress } from '@skydock/scripts'
import type { TransferItem, UploadItem, UploadProgressState } from '@skydock/scripts'
import type { ArchiveProgress } from '../../../../packages/skydock-scripts/src/archive'
import type {
  CheckProgress,
  PlanProgress,
  UploadProgress
} from '../../../../packages/skydock-scripts/src/publish'

/* What the board's poll reads while an upload runs, written from one place so that both kinds of
   upload say the same things in the same words: what is being archived, checked or sent, then done
   with what was skipped, the error that stopped it, or that it was cancelled. Beside that, the whole
   list of what this upload sends — each zip as it is made, then each file going to each folder up
   there — so the board can show all of it and where each has got to. The last file named is kept so
   that done and error can say where it got to. */
const uploadReporter = ({
  scope,
  label,
  groupId,
  outputDir
}: {
  scope: string
  label: string
  groupId?: string
  outputDir: string
}) => {
  let last = { filename: '', fileIndex: 0, totalFiles: 0 }
  /* in the order each was first heard of */
  const items = new Map<string, UploadItem>()
  const put = (item: UploadItem) => items.set(item.key, { ...items.get(item.key), ...item })
  /* only one thing is under way at a time: whatever was, is past */
  const settle = (from: UploadItem['state'], to: UploadItem['state'], but?: string) => {
    for (const item of items.values())
      if (item.state === from && item.key !== but)
        items.set(item.key, { ...item, state: to, part: undefined })
  }
  const write = (
    state: Partial<UploadProgressState> & Pick<UploadProgressState, 'state'>,
    forGroup = groupId
  ) =>
    writeUploadProgress(
      {
        scope,
        label,
        groupId: forGroup,
        filename: last.filename,
        bytesUploaded: 0,
        totalBytes: 1,
        fileIndex: last.fileIndex,
        totalFiles: last.totalFiles,
        ...state,
        items: [...items.values()]
      },
      outputDir
    )
  clearUploadProgress(outputDir)
  write({ state: 'checking', fileIndex: 0, totalFiles: 0 })
  /* What became of each, kept when the upload ends so the panel that showed it can be opened again to
     see (RULES, Transfers). What was sent, what the storage held already, what failed, and — when it
     was stopped — what was never reached. */
  const keep = (state: 'done' | 'failed' | 'cancelled', reason?: string) => {
    try {
      recordTransfer(
        {
          kind: 'upload',
          label,
          state,
          ...(reason ? { reason } : {}),
          items: [...items.values()].map((item): TransferItem => {
            const result: TransferItem['result'] =
              item.state === 'sent' || item.state === 'zipped'
                ? 'done'
                : item.state === 'there'
                  ? 'skipped'
                  : item.state === 'failed'
                    ? 'failed'
                    : 'left'
            return {
              name: item.name,
              size: item.size,
              ...(item.to ? { to: item.to } : {}),
              result
            }
          })
        },
        outputDir
      )
    } catch {
      /* a history that cannot be written is no reason to fail what it is the history of */
    }
  }
  return {
    onArchive: (archive: ArchiveProgress & { name: string }) => {
      const key = `zip:${archive.name}`
      settle('zipping', 'zipped', key)
      put({
        key,
        name: archive.name,
        size: archive.totalBytes,
        state: 'zipping',
        part: archive.totalBytes > 0 ? archive.bytes / archive.totalBytes : 0
      })
      write({
        filename: archive.name,
        bytesUploaded: archive.bytes,
        totalBytes: Math.max(1, archive.totalBytes),
        fileIndex: archive.entries,
        totalFiles: archive.totalEntries,
        state: 'archiving'
      })
    },
    onCheck: (check: CheckProgress) => {
      settle('zipping', 'zipped')
      write({
        filename: check.filename,
        fileIndex: 0,
        totalFiles: check.total,
        checked: check.checked,
        state: 'checking'
      })
    },
    /* a folder has looked: what it sends is waiting, what the storage holds is already there — and
       the zips made for it are now among what it sends */
    onPlan: (plan: PlanProgress) => {
      for (const key of [...items.keys()]) if (key.startsWith('zip:')) items.delete(key)
      for (const file of plan.send)
        put({
          key: `${file.to}/${file.name}`,
          name: file.name,
          size: file.size,
          to: file.to,
          state: 'waiting'
        })
      for (const file of plan.there)
        put({
          key: `${file.to}/${file.name}`,
          name: file.name,
          size: file.size,
          to: file.to,
          state: 'there'
        })
      write({ state: 'checking' })
    },
    onProgress: (p: UploadProgress & { groupIds: string[] }) => {
      last = { filename: p.filename, fileIndex: p.fileIndex ?? 0, totalFiles: p.totalFiles ?? 0 }
      const key = `${p.to ?? ''}/${p.filename}`
      settle('sending', 'sent', key)
      const whole = p.totalBytes > 0 && p.bytesUploaded >= p.totalBytes
      put({
        key,
        name: p.filename,
        size: p.totalBytes,
        to: p.to,
        state: whole ? 'sent' : 'sending',
        part: whole ? undefined : p.totalBytes > 0 ? p.bytesUploaded / p.totalBytes : 0
      })
      write(
        { ...last, bytesUploaded: p.bytesUploaded, totalBytes: p.totalBytes, state: 'uploading' },
        groupId ?? p.groupIds[0]
      )
    },
    done: (skipped: number) => {
      settle('sending', 'sent')
      write({
        bytesUploaded: 1,
        totalBytes: 1,
        fileIndex: last.totalFiles,
        skipped,
        state: 'done'
      })
      keep('done')
    },
    failed: (error: string) => {
      settle('sending', 'failed')
      write({ state: 'error', error })
      keep('failed', error)
    },
    /* what was under way is left as it was — it is not up there, and nothing says it is */
    cancelled: () => {
      settle('sending', 'waiting')
      settle('zipping', 'waiting')
      write({ state: 'cancelled' })
      keep('cancelled')
    }
  }
}

export { uploadReporter }
