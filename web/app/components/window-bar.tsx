import { t } from '@lingui/core/macro'
import { useWindowFrame } from '../hooks/useWindowFrame'
import { Icon } from './icons'

/* SkyDock's own window has no frame of the desktop's, so the page draws the three buttons a window has
   — minimise, maximise, close — and asks the window to do what they say. They sit at the top of the
   app itself, at the end of its own header, with nothing of a title bar of their own around them. Only
   SkyDock's own window has them; a browser tab shows none. */
const CONTROL =
  'grid size-7 place-items-center rounded-control text-ink-2 hover:bg-well hover:text-ink'

/* `onClose` stands in for the window's own close, where closing has something to ask first: a file with
   changes not saved yet */
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

/* The same buttons on a strip of their own, for a screen that has no header to put them in: the
   first look at a work folder. */
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
