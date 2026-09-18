import { fromComputer } from '../helpers/import'
import { Mini } from './buttons'
import { placeLabel } from './places-tree'
import type { Place } from './places-tree'
import type { ManifestGroup } from './types'

/* The pane beside the menu: the place's name and count, what a passenger's page offers — the
   passenger's link by email, and the two ways back — a dropzone's folder, the board's one line, and
   the files themselves below. The pane takes files from the computer for whichever place it shows. */
const PlacePane = ({
  place,
  onPlace,
  summary,
  query,
  onQuery,
  note,
  folder,
  passenger,
  incoming,
  onImport,
  children
}: {
  place: Place
  onPlace: (place: Place) => void
  summary: string
  query: string
  onQuery: (query: string) => void
  note: string | null
  /* a dropzone's folder on the storage */
  folder?: { path: string | null; onChoose: () => void }
  /* a passenger's page: the link to send once there is one, and the ways back while there are */
  passenger?: {
    linked: ManifestGroup | undefined
    emailed: boolean
    onEmail: () => void
    canTakeBack: boolean
    busy: boolean
    onReset: () => void
    onDelete: () => void
  }
  /* where a file from the computer dropped anywhere on the pane goes, if anywhere */
  incoming: { target: string; where: string } | null
  onImport: (list: FileList, target: string, where: string) => void
  children: React.ReactNode
}) => (
  <section
    onDragOver={(e) => {
      if (fromComputer(e) && incoming) e.preventDefault()
    }}
    onDrop={(e) => {
      if (!fromComputer(e) || !incoming || e.dataTransfer.files.length === 0) return
      e.preventDefault()
      onImport(e.dataTransfer.files, incoming.target, incoming.where)
    }}
    className='flex min-h-0 min-w-0 flex-col bg-ground'>
    <div className='flex flex-wrap items-center gap-[9px] border-b border-line bg-pane px-[18px] pt-2.5 pb-[9px]'>
      {place.kind === 'pax' && (
        <button
          type='button'
          onClick={() => onPlace({ kind: 'tandems' })}
          className='rounded-[5px] border border-line bg-pane px-2 py-0.5 text-[12px] text-ink-2'>
          ↰ Tandems
        </button>
      )}
      <span className='text-[12.5px] text-ink-3'>
        {place.kind === 'pax' && 'Tandems / '}
        <b className='text-[15px] font-semibold text-ink'>{placeLabel(place)}</b>
      </span>
      <span className='text-[12px] text-ink-2'>{summary}</span>
      <span className='flex-1' />
      {passenger?.linked && (
        <Mini
          title={
            passenger.emailed
              ? 'The storage’s list says the link was sent — open it to send it again'
              : 'Send the passenger their link'
          }
          onClick={passenger.onEmail}>
          {passenger.emailed
            ? '✓ Emailed · again…'
            : `Email ${passenger.linked.passenger?.firstname ?? ''}…`}
        </Mini>
      )}
      {passenger?.canTakeBack && (
        <span className='flex items-center gap-1.5'>
          <Mini
            disabled={passenger.busy}
            title='Back to before processing — keeps the name, the crops, the frames and the times'
            onClick={passenger.onReset}>
            Reset…
          </Mini>
          <Mini
            disabled={passenger.busy}
            title='Undo the tandem — its jumps go back to Unsorted, without their name or crops'
            onClick={passenger.onDelete}>
            Delete…
          </Mini>
        </span>
      )}
      <label className='flex items-center gap-1.5 rounded-md border border-line bg-ground px-[9px] py-[3px]'>
        <span
          aria-hidden='true'
          className='text-[12px] text-ink-3'>
          ⌕
        </span>
        <input
          type='text'
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder='Find a file'
          aria-label='Find a file'
          className='w-[140px] border-0 bg-transparent text-[12.5px] outline-none placeholder:text-ink-3 max-[780px]:w-[100px]'
        />
      </label>
    </div>

    {folder && (
      <div className='flex flex-wrap items-center gap-[9px] border-b border-line bg-pane px-[18px] py-[7px] text-[12px] text-ink-2'>
        <span>
          Goes to{' '}
          <code className='rounded-[3px] bg-line-2 px-[5px] py-px font-mono text-[11.5px] text-ink'>
            {folder.path ?? 'no folder yet'}
          </code>
        </span>
        <span className='ml-auto flex items-center gap-2'>
          <Mini onClick={folder.onChoose}>{folder.path ? 'Change folder' : 'Choose a folder'}</Mini>
        </span>
      </div>
    )}

    {note && (
      <p className='border-b border-line bg-accent-soft px-[18px] py-[7px] text-[12.5px] text-ink-2'>
        {note}
      </p>
    )}

    <div className='flex-1 overflow-y-auto px-[18px] pt-1 pb-10'>{children}</div>
  </section>
)

export { PlacePane }
