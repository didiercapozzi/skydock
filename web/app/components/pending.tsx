import { t } from '@lingui/core/macro'

/* What a wait looks like, said once: a ring turning in the app's colour, and a thin line that runs
   under the header while the board waits for an answer. Both show only after the wait has lasted
   long enough to be felt (see usePending). */

const Spinner = ({ large = false, label }: { large?: boolean; label?: string }) => (
  <span
    role={label ? 'status' : undefined}
    aria-label={label}
    className={`flex-none animate-spin rounded-full border-line-strong border-t-accent ${
      large ? 'size-12 border-5' : 'size-2.5 border-2'
    }`}
  />
)

/* the line across the top of the board: it moves for as long as something is being waited for */
const PendingLine = ({ active }: { active: boolean }) =>
  active && (
    <span
      role='progressbar'
      aria-label={t`Working`}
      className='pending-line pointer-events-none absolute inset-x-0 top-0 z-40'
    />
  )

/* What the board is doing, in words, from the label the action was sent under. A task that has its own
   words and window — scanning, processing, uploading — has none here. */
const doingOf = (label: string) => {
  const sent: Record<string, string> = {
    move: t`Moving files…`,
    copy: t`Copying files…`,
    trash: t`Putting files in the bin…`,
    'delete-jump': t`Deleting the jump…`,
    regroup: t`Grouping the loose files…`,
    reset: t`Putting Fresh files back…`,
    merge: t`Joining the jumps…`,
    shift: t`Moving the time…`,
    retime: t`Correcting the time…`,
    'take-back': t`Taking files back…`,
    email: t`Noting the email…`,
    'copy-back': t`Copying files back…`,
    'from-bin': t`Bringing files back…`,
    'make-montage': t`Making…`,
    moment: t`Saving the moment…`,
    'cancel-process': t`Stopping…`
  }
  const opening = label.startsWith('open:') ? t`Opening the project…` : null
  const freeing = label.startsWith('free:') ? t`Freeing space…` : null
  const removing = label.startsWith('remove:') ? t`Removing…` : null
  const linking = label.startsWith('link:') ? t`Making the link…` : null
  const back = label.startsWith('back:') ? t`Bringing files back…` : null
  const playing = label.startsWith('play:') ? t`Opening the player…` : null
  return sent[label] ?? opening ?? freeing ?? removing ?? linking ?? back ?? playing ?? null
}

export { PendingLine, Spinner, doingOf }
