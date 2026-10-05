import { t } from '@lingui/core/macro'
import { Go, Mini } from './buttons'
import { Line, Modal, Spacer } from './modal'
import { Note } from './blurbs'

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

      <p className='m-0 text-body font-semibold text-ink'>{t`What happens`}</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✕'>{t`this machine forgets the connection`}</Line>
        <Line mark='✕'>
          {t`what is up there stops being listed here, so nothing can be uploaded, freed or played from the storage until it is connected again`}
        </Line>
      </ul>

      <p className='m-0 text-body font-semibold text-ink'>{t`What does not`}</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✓'>{t`everything on the storage stays exactly as it is`}</Line>
        <Line mark='✓'>
          {t`every file on this machine stays as it is, and the board goes on working`}
        </Line>
      </ul>

      <Note>
        {t`Connecting again asks for the password — and for a code off your phone, if the account has two-step verification.`}
      </Note>
    </Modal>
  )
}

export { DisconnectDialog }
