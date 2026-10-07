import { t } from '@lingui/core/macro'
import { Mini } from './buttons'
import { Modal, Spacer } from './modal'

/* Which version of SkyDock this is — the one the installer is named after — so somebody asked what
   they have can read it off the app (RULES, The board). Opened from Settings. */
const AboutDialog = ({ onClose }: { onClose: () => void }) => {
  const version = __SKYDOCK_VERSION__
  return (
    <Modal
      label={t`About SkyDock`}
      title={t`About SkyDock`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
        </>
      }>
      <p className='text-ink'>
        <strong>SkyDock</strong>
      </p>
      <p className='text-ink-2'>{t`Version ${version}`}</p>
    </Modal>
  )
}

export { AboutDialog }
