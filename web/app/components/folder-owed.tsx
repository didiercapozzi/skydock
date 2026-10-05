import { plural, t } from '@lingui/core/macro'
import { groupableCount, hasCompletePassenger } from '@skydock/scripts'
import type { MontageFact } from '@skydock/scripts'
import type { Place } from '../helpers/places'
import { Mini } from './buttons'
import { Owed } from './place-pane'
import type { ManifestFile, ManifestGroup } from './types'

/* What is still owed in a folder, above its files: jumps to file in the sorting area, and where each
   montage has got to. A dropzone's own head says how far its files have got. A count that can be dealt with
   from here is a button. */
const FolderOwed = ({
  place,
  groups,
  loose,
  facts,
  busy,
  onRegroup,
  onReset,
  onPlace
}: {
  place: Place
  groups: ManifestGroup[]
  loose: ManifestFile[]
  facts: Record<string, MontageFact>
  busy: boolean
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
            {groupableCount(loose) > 0 && (
              <>
                {' · '}
                <button
                  type='button'
                  disabled={busy}
                  title={t`Gather the loose files here into jumps, by the gap rule — nothing is forgotten`}
                  onClick={onRegroup}
                  className='border-0 bg-transparent p-0 text-[12.5px] font-medium text-accent hover:underline disabled:opacity-40'>
                  {t`Group loose files into jumps`}
                </button>
              </>
            )}
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
  if (place.kind === 'bin' || place.kind === 'delivered') return null
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
