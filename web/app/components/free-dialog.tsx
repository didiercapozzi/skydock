import { lastSegment } from '@skydock/scripts'
import { Go, Mini } from './buttons'
import { Modal, Spacer } from './modal'
import { formatFilmSize } from './utils'
import type { ManifestGroup } from './types'

/* Freeing an uploaded tandem deletes its originals from this machine, so the dialog says three
   things before anything happens: what is proved first, what is then deleted, and what it costs —
   the tandem cannot be processed or edited again from here. */

const Line = ({ mark, children }: { mark: string; children: React.ReactNode }) => (
  <li className='flex gap-2 text-[12.5px] text-ink-2'>
    <span className='w-3 flex-none text-center'>{mark}</span>
    <span>{children}</span>
  </li>
)

const FreeDialog = ({
  who,
  group,
  onClose,
  onConfirm
}: {
  who: string
  group: ManifestGroup
  onClose: () => void
  onConfirm: () => void
}) => {
  const record = group.delivered
  const sent = record
    ? [record.film, record.photos, record.rushes, ...(record.originals ?? [])].filter(
        (f): f is NonNullable<typeof f> => f !== undefined
      )
    : []
  const originals = group.files.reduce((n, f) => n + f.size, 0)
  const copies = group.files.reduce((n, f) => n + (f.processed?.size ?? 0), 0)
  /* the originals sent as plain files are the originals themselves, not a second copy */
  const parcels = [record?.film, record?.photos, record?.rushes].reduce(
    (n, f) => n + (f?.size ?? 0),
    0
  )
  const about = originals + copies + parcels

  return (
    <Modal
      label='Free up space'
      title={`Free up space — ${who}`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>Close</Mini>
          <Go onClick={onConfirm}>Check and free about {formatFilmSize(about)}</Go>
        </>
      }>
      <p className='m-0 text-[12.5px] font-semibold text-ink'>Proved first</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        {sent.length > 0 && (
          <Line mark='✓'>
            each file that went up is hashed here and by the storage, and both must match what was
            sent:{' '}
            <code className='font-mono text-[11.5px]'>
              {sent
                .slice(0, 3)
                .map((f) => lastSegment(f.remotePath))
                .join(', ')}
              {sent.length > 3 ? ` and ${sent.length - 3} more` : ''}
            </code>
          </Line>
        )}
        <Line mark='✓'>the originals are exactly what the backup holds</Line>
        <Line mark='✓'>nothing about the tandem changed since it was uploaded</Line>
      </ul>

      <p className='m-0 text-[12.5px] font-semibold text-ink'>Then deleted from this machine</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✕'>
          the {group.files.length} original{group.files.length === 1 ? '' : 's'} (
          {formatFilmSize(originals)})
        </Line>
        <Line mark='✕'>the processed copies and the working copies made for the editor</Line>
        <Line mark='✕'>the film and the zips</Line>
      </ul>

      <p className='m-0 text-[12.5px] font-semibold text-ink'>Kept</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✓'>the kdenlive project, and the record of what went where</Line>
      </ul>

      <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
        After this the tandem lives on the storage only: it cannot be processed, edited or uploaded
        again from here, and a rescan leaves it as it is. If any check fails, nothing at all is
        deleted, and it says which.
      </p>
    </Modal>
  )
}

export { FreeDialog }
