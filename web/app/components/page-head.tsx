import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'
import { Menu } from './settings-menu'

type Tone = 'todo' | 'done' | 'plain'

const CARD: Record<Tone, string> = {
  todo: 'bg-pane shadow-hairline dark:bg-local-soft dark:shadow-none',
  done: 'bg-pane shadow-hairline dark:bg-up-soft dark:shadow-none',
  plain: 'bg-pane shadow-hairline dark:bg-accent-soft dark:shadow-none'
}

const BADGE: Record<Tone, string> = {
  todo: 'bg-local-soft text-local',
  done: 'bg-up-soft text-up',
  plain: 'bg-pane text-accent-ink shadow-soft'
}

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
  progress?: { done: number; of: number; word: string }
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
  tile: { icon: IconName; up?: boolean } | { letter: string; done?: boolean }
  title: string
  sub: string
  query?: string
  onQuery?: (query: string) => void
  menu?: (close: () => void) => React.ReactNode
  extra?: React.ReactNode
  status?: React.ReactNode
  large?: boolean
  aside?: React.ReactNode
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
                : 'bg-pane text-accent shadow-card'
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
