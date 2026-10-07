import type { freeablePlace } from '@skydock/scripts'
import { plural, t } from '@lingui/core/macro'
import { Danger, Mini } from './buttons'
import { Line, Modal, Section, Spacer } from './modal'
import { formatFilmSize } from './utils'
import { Note } from './blurbs'

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
      <Section title={t`Proved first`}>
        <Line mark='✓'>
          {plural(files.length, {
            one: 'each of the # copy that went up is hashed here and by the storage, and both must match what was sent',
            other:
              'each of the # copies that went up is hashed here and by the storage, and both must match what was sent'
          })}
        </Line>
      </Section>

      <Section title={t`Then deleted from this machine`}>
        <Line mark='✕'>{t`${deleted}: the originals, the copies and the working copies`}</Line>
      </Section>

      {reshaped > 0 && (
        <p className='m-0 rounded-control bg-changed-soft px-2.5 py-2 text-small text-ink-2'>
          {t`${plural(reshaped, { one: '# file', other: '# files' })} went up trimmed, framed or turned. Only the part that went up is kept, on the storage: what was cut off is deleted with the original, for good.`}
        </p>
      )}

      <Section title={t`Kept`}>
        <Line mark='✓'>{t`everything on the storage, still listed and played from this page`}</Line>
        {kept > 0 && (
          <Line mark='✓'>
            {plural(kept, {
              one: '# jump or loose file not all uploaded yet, left here as they are',
              other: '# jump or loose files not all uploaded yet, left here as they are'
            })}
          </Line>
        )}
      </Section>

      <Note>
        {t`After this those files live on the storage only: they cannot be processed, moved or uploaded again from here, and a rescan leaves them as they are. If any check fails, nothing at all is deleted, and it says which.`}
      </Note>
    </Modal>
  )
}

export { FreePlaceDialog }
