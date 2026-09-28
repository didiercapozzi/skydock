import { isVideoFile } from '@skydock/scripts'
import { plural, t } from '@lingui/core/macro'
import { Mini, ToBin } from './buttons'
import { Modal, Spacer } from './modal'
import { formatSize } from './utils'
import type { ManifestFile } from './types'

/* An unsorted file has been handed to nobody: the copy here is the only one outside the camera's
   card, and cards get wiped. So before any goes to the bin, this says how much is going, where it
   goes, and that the board cannot bring it back (RULES, Putting files in the bin). */
const TrashDialog = ({
  files,
  onClose,
  onConfirm
}: {
  files: ManifestFile[]
  onClose: () => void
  onConfirm: () => void
}) => {
  const videos = files.filter((f) => isVideoFile(f.path)).length
  const photos = files.length - videos
  const size = files.reduce((n, f) => n + f.size, 0)
  const kinds = [
    videos && plural(videos, { one: '# video', other: '# videos' }),
    photos && plural(photos, { one: '# photo', other: '# photos' })
  ]
    .filter(Boolean)
    .join(t` and `)
  const inAll = formatSize(size)
  const count = files.length
  return (
    <Modal
      label={t`Put in the bin`}
      title={t`Put ${plural(count, { one: '# file', other: '# files' })} in the bin?`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <ToBin
            size='go'
            onClick={onConfirm}>
            {t`Put in the bin`}
          </ToBin>
        </>
      }>
      <p className='m-0 text-[12.5px] text-ink-2'>
        {t`${kinds}, ${inAll} in all`}
        {files.length <= 3 && (
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
      <p className='m-0 rounded-r-md border-l-[3px] border-changed bg-changed-soft px-3 py-[9px] text-[12.5px] text-ink-2'>
        <b className='text-changed'>{t`These are originals nobody has been given yet.`}</b>{' '}
        {t`They leave the board and the originals folder, and a scan will not bring them back. They are moved, not erased, to`}{' '}
        <span className='font-mono text-[11.5px]'>.trash/</span>{' '}
        {t`— the only way back is to take them out of there by hand. If the camera card has been wiped, that folder holds the only copy.`}
      </p>
      <p className='m-0 text-[12px] text-ink-3'>
        {t`The bin is never emptied by SkyDock, so this frees no space until someone empties it.`}
      </p>
    </Modal>
  )
}

export { TrashDialog }
