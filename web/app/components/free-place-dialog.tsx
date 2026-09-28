import type { freeablePlace } from '@skydock/scripts'
import { plural, t } from '@lingui/core/macro'
import { Danger, Mini } from './buttons'
import { Line, Modal, Spacer } from './modal'
import { formatFilmSize } from './utils'

/* Freeing a dropzone deletes its originals from this machine, and what went up of it is the copies,
   so the dialog says before anything happens what is proved, what is deleted — naming how many files
   were delivered trimmed, cropped or turned, whose cut-off parts go with them — and what stays. */

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
  const about = formatFilmSize(bytes)
  const deleted = [
    jumps.length > 0 ? plural(jumps.length, { one: '# jump', other: '# jumps' }) : null,
    loose > 0 ? plural(loose, { one: '# loose file', other: '# loose files' }) : null
  ]
    .filter(Boolean)
    .join(t` and `)
  return (
    <Modal
      label={t`Free up space`}
      title={t`Free up space — ${place}`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <Danger onClick={onConfirm}>{t`Check and free about ${about}`}</Danger>
        </>
      }>
      <p className='m-0 text-[12.5px] font-semibold text-ink'>{t`Proved first`}</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✓'>
          {plural(files.length, {
            one: 'each of the # copy that went up is hashed here and by the storage, and both must match what was sent',
            other:
              'each of the # copies that went up is hashed here and by the storage, and both must match what was sent'
          })}
        </Line>
      </ul>

      <p className='m-0 text-[12.5px] font-semibold text-ink'>{t`Then deleted from this machine`}</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✕'>{t`${deleted}: the originals, the copies and the working copies`}</Line>
      </ul>

      {reshaped > 0 && (
        <p className='m-0 rounded-r-md border-l-[3px] border-changed bg-changed-soft px-3 py-[9px] text-[12px] text-ink-2'>
          {t`${plural(reshaped, { one: '# file', other: '# files' })} went up trimmed, framed or turned. Only the part that went up is kept, on the storage: what was cut off is deleted with the original, for good.`}
        </p>
      )}

      <p className='m-0 text-[12.5px] font-semibold text-ink'>{t`Kept`}</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✓'>{t`everything on the storage, still listed and played from this page`}</Line>
        {kept > 0 && (
          <Line mark='✓'>
            {plural(kept, {
              one: '# jump or loose file not all uploaded yet, left here as they are',
              other: '# jump or loose files not all uploaded yet, left here as they are'
            })}
          </Line>
        )}
      </ul>

      <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
        {t`After this those files live on the storage only: they cannot be processed, moved or uploaded again from here, and a rescan leaves them as they are. If any check fails, nothing at all is deleted, and it says which.`}
      </p>
    </Modal>
  )
}

export { FreePlaceDialog }
