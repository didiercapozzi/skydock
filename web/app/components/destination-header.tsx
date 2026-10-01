import { t } from '@lingui/core/macro'
import { Icon } from './icons'
import { Menu, MenuItem } from './settings-menu'

/* The head of a destination's page: who it is and where it goes, how far its files have got on the
   way to the storage, the one step that moves them on, and everything else it offers a press away.
   Three parts, one under the other: its name with its folder on the storage and a menu of what is set
   once and left alone; the way its files travel, as three stations with the step beside them; and,
   under that, the ways of finding and arranging them — which the page hands in. */

type Stages = { unprocessed: number; unsent: number; onStorage: number }

/* one station on the way: how many files are here, large, and what that means; the first with
   something in it is the one the step beside it deals with, and is lifted */
const Station = ({
  n,
  tone,
  here,
  children
}: {
  n: number
  tone: string
  here: boolean
  children: string
}) => (
  <span
    className={`inline-flex items-baseline gap-2 rounded-[14px] px-3.5 py-2 ${
      here ? 'bg-pane shadow-[0_0_0_1px_var(--color-line),0_2px_8px_rgba(16,19,26,0.07)]' : ''
    }`}>
    <span
      className={`font-display text-[24px] leading-none font-bold tracking-[-0.03em] tabular-nums ${n > 0 ? tone : 'text-ink-3'}`}>
      {n}
    </span>{' '}
    <span
      className={`text-[12.5px] font-semibold whitespace-nowrap ${here ? 'text-ink' : 'text-ink-3'}`}>
      {children}
    </span>
  </span>
)

const Arrow = () => (
  <Icon
    name='next'
    size={14}
    className='text-ink-3'
  />
)

const DestinationHeader = ({
  name,
  summary,
  path,
  stages,
  actions,
  note,
  onChangeFolder,
  onRemove,
  removing,
  busy,
  controls
}: {
  name: string
  /* how many files and how big, said once */
  summary: string
  /* its folder on the storage, when one is chosen */
  path: string | null
  stages: Stages
  /* the step that moves the files on, and freeing space: the page's own buttons */
  actions: React.ReactNode
  /* what the page says about it, if anything */
  note?: React.ReactNode
  onChangeFolder: () => void
  onRemove: () => void
  removing: boolean
  busy: boolean
  /* narrowing by name, how it is arranged, which kind */
  controls: React.ReactNode
}) => {
  const first = stages.unprocessed > 0 ? 0 : stages.unsent > 0 ? 1 : stages.onStorage > 0 ? 2 : -1
  return (
    <div className='flex flex-col gap-3.5 px-7 pt-5 pb-3'>
      <div className='flex items-center gap-4'>
        <span className='grid size-[52px] flex-none place-items-center rounded-[16px] bg-accent-soft text-accent-ink'>
          <Icon
            name='place'
            size={26}
          />
        </span>
        <div className='flex min-w-0 flex-1 flex-col gap-1'>
          <h1 className='m-0 truncate font-display text-[30px] leading-[1.05] font-bold tracking-[-0.035em] text-ink'>
            {name}
          </h1>
          <span className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3'>
            <button
              type='button'
              title={path ? t`Change the folder this destination goes to` : t`Choose a folder`}
              onClick={onChangeFolder}
              className='inline-flex min-w-0 items-center gap-1.5 rounded-lg border-0 bg-transparent p-0 text-left text-ink-3 hover:text-accent-ink'>
              <Icon
                name='storage'
                size={14}
              />
              {path ? (
                <code className='truncate font-mono text-[12px]'>{path}</code>
              ) : (
                <span className='font-semibold'>{t`Choose a folder on the storage`}</span>
              )}
            </button>
            <span className='font-medium'>{summary}</span>
          </span>
        </div>
        <Menu
          label={t`More`}
          icon='more'>
          {(close) => (
            <div className='flex flex-col'>
              <MenuItem
                icon='storage'
                onClick={() => {
                  onChangeFolder()
                  close()
                }}>
                {path ? t`Change folder…` : t`Choose a folder…`}
              </MenuItem>
              <MenuItem
                icon='bin'
                title={t`Take this destination off the board — what is filed here goes back to Fresh files, and nothing is deleted`}
                danger
                disabled={busy}
                onClick={() => {
                  onRemove()
                  close()
                }}>
                {removing ? t`Removing…` : t`Remove destination…`}
              </MenuItem>
            </div>
          )}
        </Menu>
      </div>
      {/* the way its files travel, and the step beside it that moves them on */}
      <div className='flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-[20px] bg-well px-2.5 py-2'>
        <Station
          n={stages.unprocessed}
          tone='text-local'
          here={first === 0}>
          {t`to process`}
        </Station>
        <Arrow />
        <Station
          n={stages.unsent}
          tone='text-local'
          here={first === 1}>
          {t`to upload`}
        </Station>
        <Arrow />
        <Station
          n={stages.onStorage}
          tone='text-up'
          here={first === 2}>
          {t`on the storage`}
        </Station>
        <span className='ml-auto flex flex-wrap items-center gap-2 pr-1.5'>{actions}</span>
      </div>
      {note}
      <div className='flex flex-wrap items-center gap-x-2.5 gap-y-2'>{controls}</div>
    </div>
  )
}

export { DestinationHeader }
export type { Stages }
