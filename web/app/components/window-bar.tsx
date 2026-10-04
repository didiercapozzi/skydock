import { t } from '@lingui/core/macro'
import { useWindowFrame } from '../hooks/useWindowFrame'
import { Icon } from './icons'

const CONTROL =
  'grid size-7 place-items-center rounded-[9px] text-ink-2 hover:bg-well hover:text-ink'

const WindowControls = ({ onClose }: { onClose?: () => void }) => {
  const frame = useWindowFrame()
  if (!frame) return null
  return (
    <span className='flex flex-none gap-0.5'>
      <button
        type='button'
        aria-label={t`Minimise`}
        title={t`Minimise`}
        onClick={frame.minimize}
        className={CONTROL}>
        <Icon
          name='minimise'
          size={14}
          weight={2}
        />
      </button>
      <button
        type='button'
        aria-label={frame.maximized ? t`Restore` : t`Maximise`}
        title={frame.maximized ? t`Restore` : t`Maximise`}
        onClick={frame.toggleMaximize}
        className={CONTROL}>
        <Icon
          name={frame.maximized ? 'restore' : 'maximise'}
          size={14}
          weight={2}
        />
      </button>
      <button
        type='button'
        aria-label={t`Close`}
        title={t`Close`}
        onClick={onClose ?? frame.close}
        className={`${CONTROL} hover:bg-bin hover:text-white`}>
        <Icon
          name='close'
          size={14}
          weight={2}
        />
      </button>
    </span>
  )
}

const WindowBar = () => {
  const frame = useWindowFrame()
  if (!frame) return null
  return (
    <div className='drag-region flex h-10 flex-none items-center justify-end px-2 select-none'>
      <WindowControls />
    </div>
  )
}

export { WindowBar, WindowControls }
