import { Go, Mini } from './buttons'
import { Modal, Spacer } from './modal'
import { formatFilmSize, plural } from './utils'
import type { TandemFact } from './tandem-card'
import type { ManifestGroup } from './types'

/* Resetting or deleting a tandem throws away work, some of which only a person can make again — the
   edit above all. So the dialog says exactly what goes and what stays before anything does, and the
   one button that does it says which of the two it is. */

type Mode = 'reset' | 'delete'

const Line = ({ mark, children }: { mark: string; children: React.ReactNode }) => (
  <li className='flex gap-2 text-[12.5px] text-ink-2'>
    <span className='w-3 flex-none text-center'>{mark}</span>
    <span>{children}</span>
  </li>
)

const TakeBackDialog = ({
  mode,
  who,
  groups,
  facts,
  onClose,
  onConfirm
}: {
  mode: Mode
  who: string
  /* every jump of the passenger, because they share the one folder */
  groups: ManifestGroup[]
  facts: (TandemFact | undefined)[]
  onClose: () => void
  onConfirm: () => void
}) => {
  const files = groups.flatMap((g) => g.files)
  const copies = files.filter((f) => f.processed).length
  const project = facts.some((f) => f?.project)
  const film = facts.find((f) => f?.film)?.film
  const uploaded = groups.some((g) => g.uploaded)
  const reset = mode === 'reset'

  return (
    <Modal
      label={reset ? 'Reset tandem' : 'Delete tandem'}
      title={reset ? `Reset ${who} to before processing` : `Delete ${who}’s tandem`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>Close</Mini>
          <Go onClick={onConfirm}>{reset ? 'Reset' : 'Delete'}</Go>
        </>
      }>
      <p className='m-0 text-[12.5px] font-semibold text-ink'>Deleted from this machine</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✕'>
          {copies > 0
            ? `the ${copies} processed ${copies === 1 ? 'copy' : 'copies'}`
            : 'the processed folder'}
          , and the working copies made for the editor
        </Line>
        {project && (
          <Line mark='✕'>
            <b className='text-changed'>
              the kdenlive project — the edit itself, which cannot be undone
            </b>
          </Line>
        )}
        {film && <Line mark='✕'>the rendered film ({formatFilmSize(film.size)})</Line>}
        {uploaded && <Line mark='✕'>the archives, and the record of what was uploaded</Line>}
      </ul>

      <p className='m-0 text-[12.5px] font-semibold text-ink'>
        {reset ? 'Kept, ready to process again' : 'Back to Fresh files, loose'}
      </p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        {reset ? (
          <>
            <Line mark='✓'>the name, {who}</Line>
            <Line mark='✓'>every crop and frame, and every corrected time</Line>
            <Line mark='✓'>
              {plural(groups.length, 'jump')}, {plural(files.length, 'file')}, still under Tandems
            </Line>
          </>
        ) : (
          <>
            <Line mark='↺'>{plural(files.length, 'file')}, loose, to be sorted again</Line>
            <Line mark='✕'>
              {groups.length === 1 ? 'the jump itself' : `the ${groups.length} jumps themselves`} —
              regrouping the loose files puts them back into jumps
            </Line>
            <Line mark='✕'>
              the name, every crop and frame, and every corrected time — each file goes back to the
              time its camera gave it
            </Line>
          </>
        )}
      </ul>

      <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
        The original files are never touched, and nothing is deleted from the storage:{' '}
        {uploaded
          ? 'what was uploaded stays there until someone removes it by hand.'
          : 'SkyDock never deletes anything up there.'}
      </p>
    </Modal>
  )
}

export { TakeBackDialog }
export type { Mode as TakeBackMode }
