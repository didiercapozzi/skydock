import { plural, t } from '@lingui/core/macro'
import { Go, Mini } from './buttons'
import { Line, Modal, Spacer } from './modal'

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
    jumps > 0 ? plural(jumps, { one: '# jump', other: '# jumps' }) : null,
    loose > 0 ? plural(loose, { one: '# loose file', other: '# loose files' }) : null
  ].filter(Boolean)
  const what = filed.join(t` and `)
  return (
    <Modal
      label={t`Remove a place`}
      title={t`Remove ${place}`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
          <Go onClick={onConfirm}>{t`Remove ${place}`}</Go>
        </>
      }>
      <p className='m-0 text-[12.5px] font-semibold text-ink'>{t`What happens`}</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✕'>{t`${place} stops being a place files can be filed under`}</Line>
        {filed.length > 0 ? (
          <Line mark='↩'>
            {t`${what} filed there come back to Fresh files, whole — every jump keeps its files, its name and its trims, and can be filed somewhere else`}
          </Line>
        ) : (
          <Line mark='✓'>{t`nothing is filed there`}</Line>
        )}
        {linked && <Line mark='✕'>{t`it stops being linked to ${linked} on the storage`}</Line>}
      </ul>

      <p className='m-0 text-[12.5px] font-semibold text-ink'>{t`What does not`}</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✓'>{t`every original stays on this machine, exactly where it is`}</Line>
        {linked && (
          <Line mark='✓'>
            {t`${linked} and everything in it stays on the storage, and so does any link handed out of it`}
          </Line>
        )}
      </ul>

      <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
        {t`The copies already made for ${place} were written into a folder named after it, so they are forgotten and made again wherever those jumps are filed next. Making the place again by the same name does not bring the filing back.`}
      </p>
    </Modal>
  )
}

export { RemovePlaceDialog }
