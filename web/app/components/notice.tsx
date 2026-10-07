import { t } from '@lingui/core/macro'
import { Icon } from './icons'

const Notice = ({
  problem,
  onClose,
  onOpen,
  className = '',
  children
}: {
  problem: boolean
  onClose: () => void
  onOpen?: () => void
  className?: string
  children: React.ReactNode
}) => (
  <p
    role={problem ? 'alert' : 'status'}
    className={`m-0 flex items-center gap-2.25 rounded-corner border px-2.5 py-1.75 text-body ${
      problem ? 'border-local/40 bg-local-soft text-local' : 'border-line-2 bg-rail text-ink-2'
    } ${className}`}>
    {!problem && (
      <Icon
        name='check'
        size={14}
        weight={2.2}
        className='text-up'
      />
    )}
    {onOpen ? (
      <button
        type='button'
        title={t`Show the transfer that failed`}
        onClick={onOpen}
        className='flex-1 border-0 bg-transparent p-0 text-left text-inherit underline decoration-dotted underline-offset-2'>
        {children}
      </button>
    ) : (
      <span className='flex-1'>{children}</span>
    )}
    <button
      type='button'
      aria-label={t`Dismiss`}
      title={t`Dismiss`}
      onClick={onClose}
      className='flex-none rounded-corner border-0 bg-transparent px-1 text-ink-3 hover:text-ink'>
      <Icon
        name='close'
        size={13}
      />
    </button>
  </p>
)

export { Notice }
