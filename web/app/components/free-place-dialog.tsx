import type { freeablePlace } from '@skydock/scripts'
import { Go, Mini } from './buttons'
import { Modal, Spacer } from './modal'
import { formatFilmSize } from './utils'

/* Freeing a dropzone deletes its originals from this machine, and what went up of it is the copies,
   so the dialog says before anything happens what is proved, what is deleted — naming how many files
   were delivered trimmed, cropped or turned, whose cut-off parts go with them — and what stays. */

const Line = ({ mark, children }: { mark: string; children: React.ReactNode }) => (
  <li className='flex gap-2 text-[12.5px] text-ink-2'>
    <span className='w-3 flex-none text-center'>{mark}</span>
    <span>{children}</span>
  </li>
)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const FreePlaceDialog = ({
  place,
  freeable,
  onClose,
  onConfirm
}: {
  place: string
  freeable: ReturnType<typeof freeablePlace>
  onClose: () => void
  onConfirm: () => void
}) => {
  const { jumps, files, kept, reshaped, bytes } = freeable
  const loose = files.length - jumps.reduce((n, g) => n + g.files.length, 0)
  return (
    <Modal
      label='Free up space'
      title={`Free up space — ${place}`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>Close</Mini>
          <Go onClick={onConfirm}>Check and free about {formatFilmSize(bytes)}</Go>
        </>
      }>
      <p className='m-0 text-[12.5px] font-semibold text-ink'>Proved first</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✓'>
          each of the {plural(files.length, 'copy')} that went up is hashed here and by the storage,
          and both must match what was sent
        </Line>
      </ul>

      <p className='m-0 text-[12.5px] font-semibold text-ink'>Then deleted from this machine</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✕'>
          {[
            jumps.length > 0 ? plural(jumps.length, 'jump') : null,
            loose > 0 ? plural(loose, 'loose file') : null
          ]
            .filter(Boolean)
            .join(' and ')}
          : the originals, the copies and the working copies
        </Line>
      </ul>

      {reshaped > 0 && (
        <p className='m-0 rounded-r-md border-l-[3px] border-changed bg-changed-soft px-3 py-[9px] text-[12px] text-ink-2'>
          {plural(reshaped, 'file')} went up trimmed, cropped or turned. Only the part that went up
          is kept, on the storage: what was cut off is deleted with the original, for good.
        </p>
      )}

      <p className='m-0 text-[12.5px] font-semibold text-ink'>Kept</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✓'>everything on the storage, still listed and played from this page</Line>
        {kept > 0 && (
          <Line mark='✓'>
            {plural(kept, 'jump or loose file')} not all uploaded yet, left here as they are
          </Line>
        )}
      </ul>

      <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
        After this those files live on the storage only: they cannot be processed, moved or uploaded
        again from here, and a rescan leaves them as they are. If any check fails, nothing at all is
        deleted, and it says which.
      </p>
    </Modal>
  )
}

export { FreePlaceDialog }
