import { isVideoFile } from '@skydock/scripts'
import { plural, t } from '@lingui/core/macro'
import { Go, Mini, ToBin } from './buttons'
import { Modal, Spacer } from './modal'
import { formatSize } from './utils'
import type { ManifestFile } from './types'

/* Removing files asks the one question every time, wherever they are (RULES, Putting files in the
   bin): loose in Fresh files, to be filed again — or into the bin, off the board and out of the
   originals, to be brought back from the Bin page if they were wanted after all. Files already loose
   in Fresh files have only the bin left. A copy is a jump's own hold on a file that stays where it
   is, so it cannot go to the bin. */
const RemoveFilesDialog = ({
  from,
  files,
  canLoose,
  onClose,
  onChoose
}: {
  /* where they are being removed from, named as the board names it; none when from several places */
  from: string | null
  files: ManifestFile[]
  /* whether they have somewhere to go back to — not when already loose in Fresh files */
  canLoose: boolean
  onClose: () => void
  onChoose: (to: 'fresh' | 'bin') => void
}) => {
  const count = files.length
  const videos = files.filter((f) => isVideoFile(f.path)).length
  const photos = count - videos
  const kinds = [
    videos && plural(videos, { one: '# video', other: '# videos' }),
    photos && plural(photos, { one: '# photo', other: '# photos' })
  ]
    .filter(Boolean)
    .join(t` and `)
  const inAll = formatSize(files.reduce((n, f) => n + f.size, 0))
  const copies = files.some((f) => f.copyOf)
  const counted = plural(count, { one: '# file', other: '# files' })
  return (
    <Modal
      label={t`Remove files`}
      title={from ? t`Remove ${counted} from ${from}?` : t`Remove ${counted}?`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <ToBin
            size='go'
            disabled={copies}
            title={
              copies ? t`A copy cannot go to the bin — its original stays where it is` : undefined
            }
            onClick={() => onChoose('bin')}>
            {t`Put in the bin`}
          </ToBin>
          {canLoose && <Go onClick={() => onChoose('fresh')}>{t`Loose in Fresh files`}</Go>}
        </>
      }>
      <p className='m-0 text-[12.5px] text-ink-2'>
        {t`${kinds}, ${inAll} in all`}
        {count <= 3 && (
          <>
            {' '}
            —{' '}
            <span className='font-mono text-[11.5px]'>
              {files.map((f) => f.filename).join(', ')}
            </span>
          </>
        )}
        .
      </p>
      <ul className='m-0 flex list-none flex-col gap-1.5 p-0 text-[12.5px] text-ink-2'>
        {canLoose && (
          <li>
            <b className='text-ink'>{t`Loose in Fresh files`}</b> —{' '}
            {t`on their camera's time, to be filed again. Their trims are kept.`}
          </li>
        )}
        <li>
          <b className='text-ink'>{t`Put in the bin`}</b> —{' '}
          {t`off the board and out of the originals, moved to the bin, not erased. They can be brought back from the Bin page. If the camera card has been wiped, the bin holds the only copy.`}
        </li>
      </ul>
      {copies && (
        <p className='m-0 text-[12px] text-ink-3'>
          {t`Some of these are copies: a copy can only be taken out, and its original stays where it is.`}
        </p>
      )}
    </Modal>
  )
}

export { RemoveFilesDialog }
