import { t } from '@lingui/core/macro'
import { useWindowFrame } from '../hooks/useWindowFrame'
import { Icon, Mark } from './icons'

/* The window's title bar, drawn by the page because the window has no frame of the desktop's: a
   panel of its own on the transparent window, like the others, that moves the window when dragged
   and maximises it when pressed twice. Only SkyDock's own window has it. */
const CONTROL =
  'grid size-7 place-items-center rounded-[9px] text-ink-2 hover:bg-well hover:text-ink'

const WindowBar = () => {
  const frame = useWindowFrame()
  if (!frame) return null
  return (
    <div className='flex-none px-2.5 pt-2.5 pb-2.5'>
      <div className='flex h-9 items-center rounded-[14px] bg-pane pr-1.5 text-[12.5px] font-semibold text-ink-2 shadow-card select-none'>
        {/* The part that drags is only the name's end of the bar, and the buttons are beside it, not
            inside it: on a transparent frameless window a button inside a drag region can be
            swallowed by the drag, and the window would not close. */}
        <div
          onDoubleClick={frame.toggleMaximize}
          className='flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3 [-webkit-app-region:drag]'>
          <Mark size={18} />
          <span>SkyDock</span>
        </div>
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
            onClick={frame.close}
            className={`${CONTROL} hover:bg-bin hover:text-white`}>
            <Icon
              name='close'
              size={14}
              weight={2}
            />
          </button>
        </span>
      </div>
    </div>
  )
}

export { WindowBar }
