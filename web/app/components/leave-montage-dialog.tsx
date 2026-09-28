import { isVideoFile } from '@skydock/scripts'
import { plural, t } from '@lingui/core/macro'
import { Go, Mini, ToBin } from './buttons'
import { Modal, Spacer } from './modal'
import { formatSize } from './utils'
import type { ManifestFile } from './types'

/* Files taken out of a montage have two ways out, and which one is said before anything moves (RULES,
   Montages): back to Fresh files, loose, to be filed again — or into the bin, off the board and out
   of the originals, to be brought back from the Bin page if they were wanted after all. A copy is
   the montage's own hold on a file that stays where it is, so it cannot go to the bin. */
const LeaveMontageDialog = ({
  who,
  files,
  onClose,
  onChoose
}: {
  who: string
  files: ManifestFile[]
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
  return (
    <Modal
      label={t`Take out of the montage`}
      title={t`Take ${plural(count, { one: '# file', other: '# files' })} out of ${who}?`}
      onClose={onClose}
      footer={
        <>
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <Spacer />
          <ToBin
            size='go'
            disabled={copies}
            title={
              copies ? t`A copy cannot go to the bin — its original stays where it is` : undefined
            }
            onClick={() => onChoose('bin')}>
            {t`Put in the bin`}
          </ToBin>
          <Go onClick={() => onChoose('fresh')}>{t`Back to Fresh files`}</Go>
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
        <li>
          <b className='text-ink'>{t`Back to Fresh files`}</b> —{' '}
          {t`loose, on their camera's time, to be filed again. Their trims are kept.`}
        </li>
        <li>
          <b className='text-ink'>{t`Put in the bin`}</b> —{' '}
          {t`off the board and out of the originals, moved to the bin, not erased. They can be brought back from the Bin page.`}
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

export { LeaveMontageDialog }
