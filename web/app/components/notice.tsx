import { t } from '@lingui/core/macro'

/* The line the board says after anything happens, drawn the same wherever it is shown. News in the
   app's own colour; a refusal in the colour of something still owed, and announced at once rather
   than when the reader gets round to it. Always dismissable, since it stays until the next thing
   happens and the next thing may be a while. */
const Notice = ({
  problem,
  onClose,
  className = '',
  children
}: {
  problem: boolean
  onClose: () => void
  className?: string
  children: React.ReactNode
}) => (
  <p
    role={problem ? 'alert' : 'status'}
    className={`m-0 flex items-start gap-2 text-[12.5px] text-ink-2 ${
      problem ? 'border-local bg-local-soft' : 'border-accent bg-accent-soft'
    } ${className}`}>
    <span className='flex-1'>{children}</span>
    <button
      type='button'
      aria-label={t`Dismiss`}
      title={t`Dismiss`}
      onClick={onClose}
      className='flex-none rounded px-1 leading-5 text-ink-3 hover:text-ink'>
      ✕
    </button>
  </p>
)

export { Notice }
