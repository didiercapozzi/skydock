import { t } from '@lingui/core/macro'
import { Go, Mini } from './buttons'
import { Line, Modal, Section, Spacer } from './modal'
import { Note } from './blurbs'

/* Disconnecting asks first. It costs nothing on the storage and nothing on this machine, but it
   costs the way back in: connecting again wants the password and, on an account with two-step
   verification, a code off somebody's phone. That is a poor thing to have to find because a mark
   the size of a full stop was clicked by mistake. */
const DisconnectDialog = ({
  host,
  user,
  onClose,
  onConfirm
}: {
  host: string | null
  user: string | null
  onClose: () => void
  onConfirm: () => void
}) => {
  const storage = host ?? t`The storage`
  return (
    <Modal
      label={t`Disconnect the storage`}
      title={t`Disconnect the storage`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Stay connected`}</Mini>
          <Go onClick={onConfirm}>{t`Disconnect`}</Go>
        </>
      }>
      <p className='m-0 text-body text-ink-2'>
        {user ? t`${user} on ${storage} is connected.` : t`${storage} is connected.`}
      </p>

      <Section title={t`What happens`}>
        <Line mark='✕'>{t`this machine forgets the connection`}</Line>
        <Line mark='✕'>
          {t`what is up there stops being listed here, so nothing can be uploaded, freed or played from the storage until it is connected again`}
        </Line>
      </Section>

      <Section title={t`What does not`}>
        <Line mark='✓'>{t`everything on the storage stays exactly as it is`}</Line>
        <Line mark='✓'>
          {t`every file on this machine stays as it is, and the board goes on working`}
        </Line>
      </Section>

      <Note>
        {t`Connecting again asks for the password — and for a code off your phone, if the account has two-step verification.`}
      </Note>
    </Modal>
  )
}

export { DisconnectDialog }
