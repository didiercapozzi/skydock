import { clearUploadProgress, writeUploadProgress } from '@skydock/scripts'
import type { UploadProgressState } from '@skydock/scripts'
import type { ArchiveProgress } from '../../../../packages/skydock-scripts/src/archive'
import type {
  CheckProgress,
  UploadProgress
} from '../../../../packages/skydock-scripts/src/publish'

/* What the board's poll reads while an upload runs, written from one place so that both kinds of
   upload say the same things in the same words: what is being archived, checked or sent, then done
   with what was skipped, or the error that stopped it. The last file named is kept so that done and
   error can say where it got to. */
const uploadReporter = ({
  scope,
  groupId,
  outputDir
}: {
  scope: string
  groupId?: string
  outputDir: string
}) => {
  let last = { filename: '', fileIndex: 0, totalFiles: 0 }
  const write = (
    state: Partial<UploadProgressState> & Pick<UploadProgressState, 'state'>,
    forGroup = groupId
  ) =>
    writeUploadProgress(
      {
        scope,
        groupId: forGroup,
        filename: last.filename,
        bytesUploaded: 0,
        totalBytes: 1,
        fileIndex: last.fileIndex,
        totalFiles: last.totalFiles,
        ...state
      },
      outputDir
    )
  clearUploadProgress(outputDir)
  return {
    onArchive: (archive: ArchiveProgress & { name: string }) =>
      write({
        filename: `${archive.name}.zip`,
        bytesUploaded: archive.bytes,
        totalBytes: Math.max(1, archive.totalBytes),
        fileIndex: archive.entries,
        totalFiles: archive.totalEntries,
        state: 'archiving'
      }),
    onCheck: (check: CheckProgress) =>
      write({
        filename: check.filename,
        fileIndex: 0,
        totalFiles: check.total,
        checked: check.checked,
        state: 'checking'
      }),
    onProgress: (p: UploadProgress & { groupIds: string[] }) => {
      last = { filename: p.filename, fileIndex: p.fileIndex ?? 0, totalFiles: p.totalFiles ?? 0 }
      write(
        { ...last, bytesUploaded: p.bytesUploaded, totalBytes: p.totalBytes, state: 'uploading' },
        groupId ?? p.groupIds[0]
      )
    },
    done: (skipped: number) =>
      write({
        bytesUploaded: 1,
        totalBytes: 1,
        fileIndex: last.totalFiles,
        skipped,
        state: 'done'
      }),
    failed: (error: string) => write({ state: 'error', error })
  }
}

export { uploadReporter }
