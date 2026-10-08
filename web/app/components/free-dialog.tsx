import { lastSegment } from '@skydock/scripts'
import { plural, t } from '@lingui/core/macro'
import { Danger, Mini } from './buttons'
import { Line, Modal, Section, Spacer } from './modal'
import { formatFilmSize } from './utils'
import type { ManifestGroup } from './types'
import { Note } from './blurbs'

/* Freeing an uploaded montage deletes its originals from this machine, so the dialog says three
   things before anything happens: what is proved first, what is then deleted, and what it costs —
   the montage cannot be processed or edited again from here. */

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
  const record = group.uploaded
  const sent = record
    ? [record.film, record.photos, record.rushes, ...(record.originals ?? [])].filter(
        (f) => f !== undefined
      )
    : []
  const originals = group.files.reduce((n, f) => n + f.size, 0)
  const copies = group.files.reduce((n, f) => n + (f.processed?.size ?? 0), 0)
  /* the originals sent as plain files are the originals themselves, not a second copy */
  const parcels = [record?.film, record?.photos, record?.rushes].reduce(
    (n, f) => n + (f?.size ?? 0),
    0
  )
  const about = formatFilmSize(originals + copies + parcels)
  const more = sent.length - 3
  const count = group.files.length
  const originalsSize = formatFilmSize(originals)

  return (
    <Modal
      label={t`Free up space`}
      title={t`Free up space — ${who}`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <Danger onClick={onConfirm}>{t`Check and free about ${about}`}</Danger>
        </>
      }>
      <Section title={t`Proved first`}>
        {sent.length > 0 && (
          <Line mark='✓'>
            {t`each file that went up is hashed here and by the storage, and both must match what was sent:`}{' '}
            <code className='font-mono text-micro'>
              {sent
                .slice(0, 3)
                .map((f) => lastSegment(f.remotePath))
                .join(', ')}
              {more > 0 ? t` and ${more} more` : ''}
            </code>
          </Line>
        )}
        <Line mark='✓'>{t`the originals are exactly what the backup holds`}</Line>
        <Line mark='✓'>{t`nothing about the montage changed since it was uploaded`}</Line>
      </Section>

      <Section title={t`Then deleted from this machine`}>
        <Line mark='✕'>
          {t`${plural(count, { one: 'the # original', other: 'the # originals' })} (${originalsSize})`}
        </Line>
        <Line mark='✕'>{t`the processed copies and the working copies made for the editor`}</Line>
        <Line mark='✕'>{t`the film and the zips`}</Line>
      </Section>

      <Section title={t`Kept`}>
        <Line mark='✓'>{t`the kdenlive project, and the record of what went where`}</Line>
      </Section>

      <Note>
        {t`After this the montage lives on the storage only: it cannot be processed, edited or uploaded again from here, and a rescan leaves it as it is. If any check fails, nothing at all is deleted, and it says which.`}
      </Note>
    </Modal>
  )
}

export { FreeDialog }
