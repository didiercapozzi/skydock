import { t } from '@lingui/core/macro'
import { Mini } from './buttons'
import { Modal, Spacer } from './modal'

/* Which version of SkyDock this is — the one the installer is named after — so somebody asked what
   they have can read it off the app, who made it and what it may be used under (RULES, The board).
   Opened from Settings. */
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
      <p className='m-0 text-body text-ink'>
        <strong>SkyDock</strong>
      </p>
      <p className='m-0 text-body text-ink-2'>{t`Version ${version}`}</p>
      <p className='m-0 text-body text-ink'>
        {t`Author: Capo`} —{' '}
        <a
          href='https://donkeyfall.com'
          target='_blank'
          rel='noreferrer'
          className='text-accent-ink hover:underline'>
          donkeyfall.com
        </a>
      </p>
      <p className='m-0 text-body text-ink'>{t`Licence: MIT`}</p>
    </Modal>
  )
}

export { AboutDialog }
