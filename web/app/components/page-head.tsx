import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'
import { Menu } from './settings-menu'

/* The head of a folder's page, kept to what is needed to start: what it is, a way to search, the
   folder's own menu, then one card that says in a sentence where things stand and holds the one button
   that moves them on. Nothing else — the facts about what is picked are in the panel at the right, and
   open on demand. */

type Tone = 'todo' | 'done' | 'plain'

const CARD: Record<Tone, string> = {
  todo: 'bg-[linear-gradient(135deg,#fff6e8,#fffaf2)] shadow-[0_0_0_1px_#f0dcbc] dark:bg-local-soft dark:shadow-none',
  done: 'bg-[linear-gradient(135deg,#eaf8f0,#f4fbf7)] shadow-[0_0_0_1px_#c9e6d6] dark:bg-up-soft dark:shadow-none',
  plain:
    'bg-[linear-gradient(135deg,#eef8f9,#f6fbfb)] shadow-[0_0_0_1px_#cfe5e9] dark:bg-accent-soft dark:shadow-none'
}

const BADGE: Record<Tone, string> = {
  todo: 'bg-local-soft text-local',
  done: 'bg-up-soft text-up',
  plain: 'bg-accent-soft text-accent-ink'
}

/* One sentence, one bar, one button. `progress` is how many of the whole are done, drawn as a slim bar. */
const StatusCard = ({
  tone,
  icon,
  title,
  text,
  progress,
  children
}: {
  tone: Tone
  icon: IconName
  title: string
  text?: string
  /* of the files, how many are on the storage, said under the sentence */
  progress?: { done: number; of: number; word: string }
  /* the button, or buttons, that move it on */
  children?: React.ReactNode
}) => (
  <div className={`flex items-center gap-3.5 rounded-[16px] px-4 py-2.5 ${CARD[tone]}`}>
    <span className={`grid size-9 flex-none place-items-center rounded-full ${BADGE[tone]}`}>
      <Icon
        name={icon}
        size={18}
        weight={tone === 'done' ? 2.6 : 1.9}
      />
    </span>
    <div className='min-w-0 flex-1'>
      <h2 className='m-0 truncate font-display text-[16px] font-semibold tracking-[-0.02em] text-ink'>
        {title}
      </h2>
      {text && <p className='m-0 truncate text-[12.5px] text-ink-3'>{text}</p>}
    </div>
    {progress && progress.of > 0 && (
      <div className='flex flex-none items-center gap-2.5 max-[900px]:hidden'>
        <span
          role='progressbar'
          aria-label={progress.word}
          aria-valuemin={0}
          aria-valuemax={progress.of}
          aria-valuenow={progress.done}
          className='flex h-1.5 w-[110px] overflow-hidden rounded-lg bg-line'>
          <i
            className='block h-full rounded-lg bg-up'
            style={{ width: `${Math.round((progress.done / progress.of) * 100)}%` }}
          />
        </span>
        <span className='text-[12px] whitespace-nowrap text-ink-3'>{progress.word}</span>
      </div>
    )}
    {children && (
      <div className='flex flex-none flex-wrap items-center gap-2 [&_button]:h-9 [&_button]:rounded-[11px] [&_button]:px-4 [&_button]:text-[13.5px]'>
        {children}
      </div>
    )}
  </div>
)

/* a round icon button, the same on every page */
const ROUND =
  'grid size-10 flex-none place-items-center rounded-[13px] border-0 bg-well text-ink hover:bg-line'

const PageHead = ({
  tile,
  title,
  sub,
  query,
  onQuery,
  menu,
  extra,
  status,
  large = false,
  aside,
  searchOpen = false,
  findLabel
}: {
  /* what draws the tile at the left: an icon, or a letter */
  tile: { icon: IconName; up?: boolean } | { letter: string; done?: boolean }
  title: string
  /* one quiet line under the name */
  sub: string
  /* the way to narrow what is listed, absent where nothing is */
  query?: string
  onQuery?: (query: string) => void
  /* what the folder's ⋯ menu holds: its own things, set once and left alone */
  menu?: (close: () => void) => React.ReactNode
  /* more of the folder's own buttons, beside the menu */
  extra?: React.ReactNode
  /* the card under the head */
  status?: React.ReactNode
  /* a montage's page: the tile and the name drawn larger */
  large?: boolean
  /* something small at the far end, before the buttons */
  aside?: React.ReactNode
  /* the box to narrow by name is there from the start, with a word of its own */
  searchOpen?: boolean
  findLabel?: string
}) => {
  const [searching, setSearching] = useState(false)
  const showSearch = searching || searchOpen || Boolean(query)
  return (
    <div className='flex flex-col gap-4 px-7 pt-6 pb-3'>
      <div className='flex items-center gap-[18px]'>
        <span
          className={`grid flex-none place-items-center ${
            large ? 'size-[56px] rounded-[19px]' : 'size-[48px] rounded-[16px]'
          } ${
            'letter' in tile
              ? tile.done
                ? 'bg-up text-white'
                : 'bg-[linear-gradient(135deg,#0e7a8f,#5cc0cf)] text-white'
              : 'up' in tile && tile.up
                ? 'bg-up-soft text-up'
                : 'bg-accent-soft text-accent-ink'
          }`}>
          {'icon' in tile ? (
            <Icon
              name={tile.icon}
              size={24}
            />
          ) : tile.done ? (
            <Icon
              name='check'
              size={28}
              weight={2.6}
            />
          ) : (
            <b className='font-display text-[24px] font-semibold'>{tile.letter}</b>
          )}
        </span>
        <div className='min-w-0 flex-1'>
          <h1
            className={`m-0 truncate font-display leading-[1.1] font-semibold tracking-[-0.035em] text-ink ${large ? 'text-[32px]' : 'text-[28px]'}`}>
            {title}
          </h1>
          <p className='m-0 truncate text-ink-3'>{sub}</p>
        </div>
        {onQuery &&
          (showSearch ? (
            <label className='flex h-10 w-[240px] items-center gap-2.5 rounded-[13px] bg-well px-3 text-ink-3 focus-within:shadow-[0_0_0_1.5px_var(--color-accent)]'>
              <Icon
                name='search'
                size={16}
              />
              <input
                type='text'
                autoFocus={!searchOpen}
                value={query ?? ''}
                onChange={(e) => onQuery(e.target.value)}
                onBlur={() => !query && setSearching(false)}
                placeholder={findLabel ?? t`Narrow by name`}
                aria-label={findLabel ?? t`Find a file`}
                className='min-w-0 flex-1 border-0 bg-transparent text-[13.5px] font-medium text-ink outline-none placeholder:text-ink-3'
              />
            </label>
          ) : (
            <button
              type='button'
              aria-label={t`Search`}
              title={t`Narrow by name`}
              onClick={() => setSearching(true)}
              className={ROUND}>
              <Icon
                name='search'
                size={18}
              />
            </button>
          ))}
        {aside}
        {extra}
        {menu && (
          <Menu
            label={t`More`}
            icon='more'>
            {menu}
          </Menu>
        )}
      </div>
      {status}
    </div>
  )
}

export { PageHead, StatusCard }
