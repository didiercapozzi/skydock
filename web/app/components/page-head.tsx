import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'
import { Menu } from './settings-menu'

/* The head of a folder's page, kept to what is needed to start: what it is, a way to search, the
   folder's own menu, then one card that says in a sentence where things stand and holds the button
   that moves them on. Nothing else — the facts about what is picked are in the panel at the right, and
   open on demand. */

type Tone = 'todo' | 'done' | 'plain'

const CARD: Record<Tone, string> = {
  todo: 'bg-(image:--gradient-paper-todo) shadow-card dark:bg-none dark:bg-local-soft dark:shadow-none',
  done: 'bg-(image:--gradient-paper-done) shadow-card dark:bg-none dark:bg-up-soft dark:shadow-none',
  plain:
    'bg-(image:--gradient-paper-plain) shadow-card dark:bg-none dark:bg-accent-soft dark:shadow-none'
}

const BADGE: Record<Tone, string> = {
  todo: 'bg-local-soft text-local',
  done: 'bg-up-soft text-up',
  plain: 'bg-pane text-accent-ink shadow-soft'
}

/* One sentence, one bar, the button that goes next (and freeing, where it can be done). `progress` is how many of the whole are done, drawn as a slim bar. */
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
  <div
    className={`flex flex-wrap items-center min-h-16 gap-3.5 rounded-corner px-4 py-2.5 ${CARD[tone]}`}>
    <span className={`grid size-9 flex-none place-items-center rounded-full ${BADGE[tone]}`}>
      <Icon
        name={icon}
        size={18}
        weight={tone === 'done' ? 2.6 : 1.9}
      />
    </span>
    {/* the sentence keeps room to be read: where the bar and the buttons leave too little, the buttons go under it */}
    <div className='min-w-32 flex-1'>
      <h2 className='m-0 truncate font-display text-title font-semibold tracking-title text-ink'>
        {title}
      </h2>
      {text && <p className='m-0 truncate text-body text-ink-3'>{text}</p>}
    </div>
    {progress && progress.of > 0 && (
      <div className='flex flex-none items-center gap-2.5 max-roomy:hidden'>
        <span
          role='progressbar'
          aria-label={progress.word}
          aria-valuemin={0}
          aria-valuemax={progress.of}
          aria-valuenow={progress.done}
          className='flex h-1.5 w-27.5 overflow-hidden rounded-corner bg-line'>
          <i
            className='block h-full rounded-corner bg-up'
            style={{ width: `${Math.round((progress.done / progress.of) * 100)}%` }}
          />
        </span>
        <span className='text-small whitespace-nowrap text-ink-3'>{progress.word}</span>
      </div>
    )}
    {children && (
      <div className='ml-auto flex flex-none flex-wrap items-center gap-2 [&_button]:h-9 [&_button]:rounded-corner [&_button]:px-4 [&_button]:text-lead'>
        {children}
      </div>
    )}
  </div>
)

/* a round icon button, the same on every page */
const SEARCH =
  'inline-flex h-control-lg flex-none items-center gap-2 rounded-corner border-0 bg-pane px-4 text-lead font-semibold text-accent-ink shadow-card hover:bg-accent-soft'

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
      <div className='flex items-center gap-4.5'>
        <span
          className={`grid flex-none place-items-center ${
            large ? 'size-14 rounded-corner' : 'size-12 rounded-corner'
          } ${
            'letter' in tile
              ? tile.done
                ? 'bg-up text-white'
                : 'bg-(image:--gradient-avatar-1) text-white'
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
            <b className='font-display text-heading font-semibold'>{tile.letter}</b>
          )}
        </span>
        <div className='min-w-0 flex-1'>
          <h1
            className={`m-0 truncate font-display leading-title font-semibold tracking-display text-ink ${large ? 'text-display' : 'text-display'}`}>
            {title}
          </h1>
          <p className='m-0 truncate text-ink-3'>{sub}</p>
        </div>
        {onQuery &&
          (showSearch ? (
            <label className='flex h-control-lg w-60 items-center gap-2.5 rounded-corner bg-well px-4 text-ink-3 focus-within:shadow-focus'>
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
                className='bare-input'
              />
            </label>
          ) : (
            <button
              type='button'
              aria-label={t`Search`}
              title={t`Narrow by name`}
              onClick={() => setSearching(true)}
              className={SEARCH}>
              <Icon
                name='search'
                size={18}
              />
              {t`Search`}
            </button>
          ))}
        {aside}
        {extra}
        {menu && (
          <Menu
            label={t`More`}
            icon='more'
            round>
            {menu}
          </Menu>
        )}
      </div>
      {status}
    </div>
  )
}

export { PageHead, StatusCard }
