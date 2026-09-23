import { Go, Mini } from './buttons'
import { Line, Modal, Spacer } from './modal'

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
}) => (
  <Modal
    label='Disconnect the storage'
    title='Disconnect the storage'
    onClose={onClose}
    footer={
      <>
        <Spacer />
        <Mini onClick={onClose}>Stay connected</Mini>
        <Go onClick={onConfirm}>Disconnect</Go>
      </>
    }>
    <p className='m-0 text-[12.5px] text-ink-2'>
      {user ? `${user} on ` : ''}
      {host ?? 'The storage'} is connected.
    </p>

    <p className='m-0 text-[12.5px] font-semibold text-ink'>What happens</p>
    <ul className='m-0 flex list-none flex-col gap-1 p-0'>
      <Line mark='✕'>this machine forgets the connection</Line>
      <Line mark='✕'>
        what is up there stops being listed here, so nothing can be uploaded, freed or played from
        the storage until it is connected again
      </Line>
    </ul>

    <p className='m-0 text-[12.5px] font-semibold text-ink'>What does not</p>
    <ul className='m-0 flex list-none flex-col gap-1 p-0'>
      <Line mark='✓'>everything on the storage stays exactly as it is</Line>
      <Line mark='✓'>every file on this machine stays as it is, and the board goes on working</Line>
    </ul>

    <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
      Connecting again asks for the password — and for a code off your phone, if the account has
      two-step verification.
    </p>
  </Modal>
)

export { DisconnectDialog }
