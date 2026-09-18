import { hasCompletePassenger } from '@skydock/scripts'
import type { FileStatus, TandemFact } from '@skydock/scripts'
import type { Place } from '../helpers/places'
import { Mini } from './buttons'
import { Owed } from './place-pane'
import type { ManifestFile, ManifestGroup } from './types'
import { plural } from './utils'

/* What is still owed in a folder, above its files: jumps to file in the sorting area, files to
   process or upload in a dropzone, and where each tandem has got to. A count that can be dealt with
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
  onRegroup,
  onReset,
  onPlace
}: {
  place: Place
  groups: ManifestGroup[]
  loose: ManifestFile[]
  files: ManifestFile[]
  facts: Record<string, TandemFact>
  statusOf: (file: ManifestFile) => FileStatus
  busy: boolean
  /* a dropzone's folder on the storage, and a way to choose it */
  folder?: { path: string | null; onChoose: () => void }
  onRegroup: () => void
  /* everything still to be sorted, back as a scan would first have left it */
  onReset: () => void
  onPlace: (place: Place) => void
}) => {
  if (place.kind === 'sort') {
    if (groups.length === 0 && loose.length === 0)
      return <Owed tone='done'>Nothing left to sort</Owed>
    return (
      <>
        {groups.length > 0 && <Owed tone='todo'>{plural(groups.length, 'jump')} to file</Owed>}
        {loose.length > 0 && (
          <Owed tone='plain'>
            {plural(loose.length, 'loose file')}
            {place.kind === 'sort' && (
              <>
                {' · '}
                <button
                  type='button'
                  disabled={busy}
                  title='Gather the loose files here into jumps, by the gap rule — nothing is forgotten'
                  onClick={onRegroup}
                  className='border-0 bg-transparent p-0 text-[12px] text-accent underline disabled:opacity-40'>
                  group them into jumps
                </button>
              </>
            )}
          </Owed>
        )}
        <button
          type='button'
          disabled={busy}
          title='Put Fresh files back — the times alone, or everything as just scanned. Asks which first.'
          onClick={onReset}
          className='border-0 bg-transparent p-0 text-[12px] text-accent underline disabled:opacity-40'>
          reset…
        </button>
        <span className='ml-auto text-ink-3 max-[900px]:hidden'>
          Drag a jump onto a folder on the left, or use <b className='text-ink-2'>File to</b> on its
          line
        </span>
      </>
    )
  }
  if (place.kind === 'dz') {
    const count = (s: FileStatus) => files.filter((f) => statusOf(f) === s).length
    return (
      <>
        {count('local') > 0 && <Owed tone='todo'>{count('local')} to process</Owed>}
        {count('processed') > 0 && <Owed tone='todo'>{count('processed')} to upload</Owed>}
        {count('uploaded') > 0 && <Owed tone='done'>{count('uploaded')} on the storage</Owed>}
        {folder && (
          <span className='ml-auto flex flex-wrap items-center gap-2'>
            Goes to
            <code className='rounded-[3px] bg-line-2 px-[5px] py-px font-mono text-[11.5px] text-ink'>
              {folder.path ?? 'no folder yet'}
            </code>
            <Mini onClick={folder.onChoose}>
              {folder.path ? 'Change folder' : 'Choose a folder'}
            </Mini>
          </span>
        )}
      </>
    )
  }
  if (place.kind === 'storage') return null
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
          {unnamed} to name
        </Owed>
      )}
      {toProcess > 0 && <Owed tone='todo'>{toProcess} to process</Owed>}
      {toEdit > 0 && <Owed tone='todo'>{toEdit} to edit</Owed>}
      {toRender > 0 && <Owed tone='todo'>{toRender} to render</Owed>}
      {toUpload > 0 && <Owed tone='todo'>{toUpload} to upload</Owed>}
      {uploaded > 0 && <Owed tone='done'>{uploaded} uploaded</Owed>}
    </>
  )
}

export { FolderOwed }
