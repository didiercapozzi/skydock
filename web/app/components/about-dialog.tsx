import { t } from '@lingui/core/macro'
import { Mini } from './buttons'
import { Modal, Spacer } from './modal'

/* Who made SkyDock and what it may be used under (RULES, The board). */
const AboutDialog = ({ onClose }: { onClose: () => void }) => (
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
    <p className='m-0 text-body text-ink-2'>{t`A dropzone’s media, from the cameras to the passenger`}</p>
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

export { AboutDialog }
