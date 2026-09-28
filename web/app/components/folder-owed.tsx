import { plural, t } from '@lingui/core/macro'
import { hasCompletePassenger } from '@skydock/scripts'
import type { FileStatus, MontageFact } from '@skydock/scripts'
import type { Place } from '../helpers/places'
import { Mini } from './buttons'
import { Owed } from './place-pane'
import type { ManifestFile, ManifestGroup } from './types'

/* What is still owed in a folder, above its files: jumps to file in the sorting area, files to
   process or upload in a dropzone, and where each montage has got to. A count that can be dealt with
   from here is a button. */
const FolderOwed = ({
  place,
  groups,
  loose,
  files,
  facts,
  statusOf,
  busy,
  folder,
  actions,
  onRegroup,
  onReset,
  onPlace
}: {
  place: Place
  groups: ManifestGroup[]
  loose: ManifestFile[]
  files: ManifestFile[]
  facts: Record<string, MontageFact>
  statusOf: (file: ManifestFile) => FileStatus
  busy: boolean
  /* a dropzone's folder on the storage, and a way to choose it */
  folder?: { path: string | null; onChoose: () => void }
  /* what deals with what is owed, beside the counts it deals with — a folder's whole next step */
  actions?: React.ReactNode
  onRegroup: () => void
  /* everything still to be sorted, back as a scan would first have left it */
  onReset: () => void
  onPlace: (place: Place) => void
}) => {
  if (place.kind === 'sort') {
    const jumps = groups.length
    const looseCount = loose.length
    if (groups.length === 0 && loose.length === 0)
      return <Owed tone='done'>{t`Nothing left to sort`}</Owed>
    return (
      <>
        {groups.length > 0 && (
          <Owed tone='todo'>{t`${plural(jumps, { one: '# jump', other: '# jumps' })} to file`}</Owed>
        )}
        {loose.length > 0 && (
          <Owed tone='plain'>
            {plural(looseCount, { one: '# loose file', other: '# loose files' })}
            {place.kind === 'sort' && (
              <>
                {' · '}
                <button
                  type='button'
                  disabled={busy}
                  title={t`Gather the loose files here into jumps, by the gap rule — nothing is forgotten`}
                  onClick={onRegroup}
                  className='border-0 bg-transparent p-0 text-[12px] text-accent underline disabled:opacity-40'>
                  {t`Group loose files into jumps`}
                </button>
              </>
            )}
          </Owed>
        )}
        <span className='ml-auto text-ink-3 max-[900px]:hidden'>
          {t`Drag a jump onto a destination on the left, or use Move to… on it`}
        </span>
        {/* at the far end and drawn as a button: it is not another way of grouping, it asks what to
            forget */}
        <span className='max-[900px]:ml-auto'>
          <Mini
            disabled={busy}
            title={t`Put Fresh files back — the times alone, or everything as just scanned. Asks which first.`}
            onClick={onReset}>
            {t`Reset Fresh files…`}
          </Mini>
        </span>
      </>
    )
  }
  if (place.kind === 'dz') {
    const count = (s: FileStatus) => files.filter((f) => statusOf(f) === s).length
    const unprocessed = count('local')
    const unsent = count('processed')
    const onStorage = count('uploaded')
    return (
      <>
        {unprocessed > 0 && <Owed tone='todo'>{t`${unprocessed} to process`}</Owed>}
        {unsent > 0 && <Owed tone='todo'>{t`${unsent} to upload`}</Owed>}
        {onStorage > 0 && <Owed tone='done'>{t`${onStorage} on the storage`}</Owed>}
        {actions}
        {folder && (
          <span className='ml-auto flex flex-wrap items-center gap-2'>
            {t`Goes to`}
            <code className='rounded-[3px] bg-line-2 px-[5px] py-px font-mono text-[11.5px] text-ink'>
              {folder.path ?? t`no folder yet`}
            </code>
            <Mini onClick={folder.onChoose}>
              {folder.path ? t`Change folder` : t`Choose a folder`}
            </Mini>
          </span>
        )}
      </>
    )
  }
  if (place.kind === 'storage' || place.kind === 'bin') return null
  const live = groups.filter((g) => !g.freed)
  const by = (test: (g: ManifestGroup) => boolean) => live.filter(test).length
  const unnamed = by((g) => !hasCompletePassenger(g.passenger))
  const named = (g: ManifestGroup) => hasCompletePassenger(g.passenger)
  const toProcess = by((g) => named(g) && !g.processed && !g.uploaded)
  const toEdit = by((g) => Boolean(g.processed) && !facts[g.id]?.project && !g.uploaded)
  const toRender = by((g) => Boolean(facts[g.id]?.project) && !facts[g.id]?.film && !g.uploaded)
  const toUpload = by((g) => Boolean(facts[g.id]?.film) && !g.uploaded)
  const uploaded = groups.filter((g) => g.uploaded).length
  return (
    <>
      {unnamed > 0 && (
        <Owed
          tone='todo'
          onClick={place.kind === 'unnamed' ? undefined : () => onPlace({ kind: 'unnamed' })}>
          {t`${unnamed} to name`}
        </Owed>
      )}
      {toProcess > 0 && <Owed tone='todo'>{t`${toProcess} to process`}</Owed>}
      {toEdit > 0 && <Owed tone='todo'>{t`${toEdit} to edit`}</Owed>}
      {toRender > 0 && <Owed tone='todo'>{t`${toRender} to render`}</Owed>}
      {toUpload > 0 && <Owed tone='todo'>{t`${toUpload} to upload`}</Owed>}
      {uploaded > 0 && <Owed tone='done'>{t`${uploaded} uploaded`}</Owed>}
    </>
  )
}

export { FolderOwed }
