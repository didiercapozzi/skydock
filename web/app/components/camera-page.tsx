import { t } from '@lingui/core/macro'
import { Icon } from './icons'

/* A camera's page keeps two things beside its files: whether its new files are copied by themselves the
   moment it is plugged in — off to begin with, for the camera that is not yours — and, when it is not
   plugged in, why there is nothing to look at. */

const CameraSwitch = ({ auto, onChange }: { auto: boolean; onChange: (on: boolean) => void }) => (
  <label className='flex cursor-pointer items-center gap-4 rounded-panel bg-pane px-4.5 py-3.5 shadow-hairline'>
    <input
      type='checkbox'
      role='switch'
      checked={auto}
      onChange={(e) => onChange(e.target.checked)}
      className='peer sr-only'
    />
    <span
      aria-hidden='true'
      className={`relative h-7 w-11.5 flex-none rounded-full transition-colors after:absolute after:top-0.75 after:left-0.75 after:size-chip after:rounded-full after:bg-white after:shadow-chip after:transition-transform peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
        auto ? 'bg-accent after:translate-x-4.5' : 'bg-line-strong'
      }`}
    />
    <span className='min-w-0 flex-1'>
      <b className='block text-lead'>{t`Copy new files automatically`}</b>
      <span className='text-body text-ink-3'>
        {auto
          ? t`On — new files are copied as soon as it is plugged in. Switch it off to choose files yourself.`
          : t`Off — when it is plugged in, SkyDock says how many new files it holds and waits. Right for a camera that is not yours.`}
      </span>
    </span>
  </label>
)

const AbsentCamera = ({ known }: { known: boolean }) => (
  <div className='flex flex-col items-center gap-3 rounded-panel bg-pane px-8 py-10 text-center shadow-hairline'>
    <span className='grid size-16 place-items-center rounded-full bg-well text-ink-3'>
      <Icon
        name='camera'
        size={30}
      />
    </span>
    <h2 className='m-0 font-display text-heading font-semibold tracking-display'>
      {known ? t`Plug it in to look at it` : t`This camera is not in the list`}
    </h2>
    <p className='m-0 max-w-130 text-ink-3'>
      {known
        ? t`When it is connected again, SkyDock checks it for new files. What was copied from it stays on this machine either way.`
        : t`It was forgotten, or this is an address from another machine. Plug a camera in and it appears here.`}
    </p>
  </div>
)

export { AbsentCamera, CameraSwitch }
