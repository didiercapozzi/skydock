import { plural, t } from '@lingui/core/macro'
import { hasCompletePassenger } from '@skydock/scripts'
import type { FileStatus, MontageFact } from '@skydock/scripts'
import type { Place } from '../helpers/places'
import { Mini } from './buttons'
import { Owed } from './place-pane'
import type { ManifestFile, ManifestGroup } from './types'

/* one of a dropzone's counts: the number large, what it counts under it, grey when it is none */
const Stat = ({
  n,
  tone,
  first,
  children
}: {
  n: number
  tone: string
  first?: boolean
  children: string
}) => (
  <span className={`flex flex-col gap-0.5 ${first ? 'pr-3.5' : 'border-l border-line px-3.5'}`}>
    <span
      className={`font-display text-[26px] leading-none font-bold tracking-[-0.03em] tabular-nums ${n > 0 ? tone : 'text-ink-3'}`}>
      {n}
    </span>{' '}
    <span className='text-[12px] font-medium text-ink-3'>{children}</span>
  </span>
)

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
    return (
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-ink-2'>
        {groups.length === 0 && loose.length === 0 && (
          <Owed tone='done'>{t`Nothing left to sort`}</Owed>
        )}
        {groups.length > 0 && (
          <Owed tone='todo'>{t`${plural(jumps, { one: '# jump', other: '# jumps' })} to file`}</Owed>
        )}
        {loose.length > 0 && (
          <Owed tone='plain'>
            {plural(looseCount, {
              one: '# loose file',
              other: '# loose files'
            })}
            {' · '}
            <button
              type='button'
              disabled={busy}
              title={t`Gather the loose files here into jumps, by the gap rule — nothing is forgotten`}
              onClick={onRegroup}
              className='border-0 bg-transparent p-0 text-[12.5px] font-medium text-accent hover:underline disabled:opacity-40'>
              {t`Group loose files into jumps`}
            </button>
          </Owed>
        )}
        {(groups.length > 0 || loose.length > 0) && (
          <span className='ml-auto text-[11.5px] text-ink-3 max-[900px]:hidden'>
            {t`Drag a jump onto a destination on the left, or use Move to… on it`}
          </span>
        )}
        {/* at the far end and drawn as a button: it is not another way of grouping, it asks what to
            forget */}
        <span className={groups.length > 0 || loose.length > 0 ? 'max-[900px]:ml-auto' : 'ml-auto'}>
          <Mini
            disabled={busy}
            title={t`Put Fresh files back — the times alone, or everything as just scanned. Asks which first.`}
            onClick={onReset}>
            {t`Reset Fresh files…`}
          </Mini>
        </span>
      </div>
    )
  }
  /* A dropzone's card: how many files are still to process, to upload and already on the storage,
     large enough to be read across the room, then what that means and the one step that deals with
     it. All three are always shown, so the card reads the same from one day to the next. */
  if (place.kind === 'dz') {
    const count = (s: FileStatus) => files.filter((f) => statusOf(f) === s).length
    const unprocessed = count('local')
    const unsent = count('processed')
    const onStorage = count('uploaded')
    return (
      <div className='flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl bg-well px-4 py-3.5'>
        <Stat
          n={unprocessed}
          tone='text-local'
          first>
          {t`to process`}
        </Stat>
        <Stat
          n={unsent}
          tone='text-local'>
          {t`to upload`}
        </Stat>
        <Stat
          n={onStorage}
          tone='text-up'>
          {t`on the storage`}
        </Stat>
        <span className='flex min-w-[200px] flex-1 flex-col gap-1 border-l border-line px-3 text-[11.5px] leading-normal text-ink-3'>
          {t`Every file in the folder that needs it, whatever is filtered or picked. Upload opens once all are processed.`}
          {folder && (
            <span className='flex flex-wrap items-center gap-1.5'>
              {t`Goes to`}
              <code className='rounded-md bg-pane px-1.5 py-px font-mono text-[11px] text-ink'>
                {folder.path ?? t`no folder yet`}
              </code>
              <button
                type='button'
                onClick={folder.onChoose}
                className='border-0 bg-transparent p-0 text-[11.5px] font-medium text-accent hover:underline'>
                {folder.path ? t`Change folder` : t`Choose a folder`}
              </button>
            </span>
          )}
        </span>
        {actions}
      </div>
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
  if (unnamed + toProcess + toEdit + toRender + toUpload + uploaded === 0) return null
  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]'>
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
    </div>
  )
}

export { FolderOwed }
