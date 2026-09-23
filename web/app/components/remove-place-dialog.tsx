import { Go, Mini } from './buttons'
import { Line, Modal, Spacer } from './modal'
import { plural } from './utils'

/* Taking a place off the board deletes nothing, and the dialog's whole job is to say so: what was
   filed there comes back to Fresh files to be filed again, the files stay where they are on this
   machine, and the folder on the storage is left exactly as it is. */
const RemovePlaceDialog = ({
  place,
  jumps,
  loose,
  linked,
  onClose,
  onConfirm
}: {
  place: string
  jumps: number
  loose: number
  /* the folder on the storage this place uploads into, when one has been picked */
  linked: string | null
  onClose: () => void
  onConfirm: () => void
}) => {
  const filed = [
    jumps > 0 ? plural(jumps, 'jump') : null,
    loose > 0 ? plural(loose, 'loose file') : null
  ].filter(Boolean)
  return (
    <Modal
      label='Remove a place'
      title={`Remove ${place}`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>Close</Mini>
          <Go onClick={onConfirm}>Remove {place}</Go>
        </>
      }>
      <p className='m-0 text-[12.5px] font-semibold text-ink'>What happens</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✕'>{place} stops being a place files can be filed under</Line>
        {filed.length > 0 ? (
          <Line mark='↩'>
            {filed.join(' and ')} filed there come back to Fresh files, whole — every jump keeps its
            files, its name and its trims, and can be filed somewhere else
          </Line>
        ) : (
          <Line mark='✓'>nothing is filed there</Line>
        )}
        {linked && <Line mark='✕'>it stops being linked to {linked} on the storage</Line>}
      </ul>

      <p className='m-0 text-[12.5px] font-semibold text-ink'>What does not</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✓'>every original stays on this machine, exactly where it is</Line>
        {linked && (
          <Line mark='✓'>
            {linked} and everything in it stays on the storage, and so does any link handed out of
            it
          </Line>
        )}
      </ul>

      <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
        The copies already made for {place} were written into a folder named after it, so they are
        forgotten and made again wherever those jumps are filed next. Making the place again by the
        same name does not bring the filing back.
      </p>
    </Modal>
  )
}

export { RemovePlaceDialog }
