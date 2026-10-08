import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { keepLanguage, spokenNow } from '../helpers/language'
import type { Language } from '../helpers/language'
import { Seg } from './buttons'
import { FindAnything } from './find-anything'
import type { Found } from './find-anything'
import { WindowControls } from './window-bar'
import { Spinner } from './pending'
import { Icon } from './icons'
import { MenuItem, SettingsMenu, SettingsRow, TOOL } from './settings-menu'
import { setFileView, useFileView } from '../hooks/useFileView'
import { useJobs } from '../hooks/liveStore'
import { headlineOf } from './jobs-panel'
import { useZoom } from '../hooks/useZoom'
import {
  setDetailsColumn,
  setDetailsDrawer,
  useDetailsColumn,
  useDetailsDrawer
} from '../hooks/useDetails'
import { setTileSize, TILE_SIZE, useTileSize } from '../hooks/useTileSize'
import { setTheme, useTheme } from '../hooks/useTheme'
import { formatSize } from './utils'

const VIEWS = [
  ['rows', msg`Rows`, 'rows'],
  ['grid', msg`Thumbnails`, 'overview']
] as const

const THEMES = [
  ['auto', msg`Auto`, '◐'],
  ['light', msg`Light`, '☀'],
  ['dark', msg`Dark`, '☾']
] as const

const LANGUAGE_NAMES = [
  ['en', 'English', 'EN'],
  ['fr', 'Français', 'FR'],
  ['de', 'Deutsch', 'DE']
] as const satisfies readonly (readonly [Language, string, string])[]

const said = <T extends string>(options: readonly (readonly [T, MessageDescriptor, string])[]) =>
  options.map(([value, name, mark]) => [value, i18n._(name), mark] as const)

type NasLink = {
  label: string
  mark?: string
  title?: string
  disabled?: boolean
  onClick: () => void
}

const shortHost = (host: string) => host.replace(/^https?:\/\//, '').replace(/[:/].*$/, '')

const BoardHeader = ({
  scanning,
  onScan,
  onTemplates,
  onWorkFolder,
  onShortcuts,
  onAbout,
  find
}: {
  scanning: boolean
  onScan: () => void
  onTemplates: () => void
  onWorkFolder: () => void
  onShortcuts: () => void
  onAbout: () => void
  find: (query: string) => Found[]
}) => {
  const view = useFileView()
  const tileSize = useTileSize()
  const theme = useTheme()
  const language = spokenNow()
  const speakIn = (next: Language) => {
    keepLanguage(next)
    window.location.reload()
  }
  return (
    <header className='drag-region flex h-14 flex-none items-center gap-1 rounded-t-corner isle-head px-3.5 max-desk:rounded-corner desk:rounded-tl-none wide:group-data-[docked]:rounded-tr-none desk:col-start-3 wide:col-end-6 desk:row-start-1'>
      <button
        type='button'
        disabled={scanning}
        onClick={onScan}
        aria-label={t`Rescan cameras`}
        title={t`Copy what is new on every camera plugged in — what is here already is passed over — and look through the work folder for files the board does not know yet`}
        className={TOOL}>
        <Icon
          name='scan'
          className={`text-ink-2 ${scanning ? 'animate-spin' : ''}`}
        />
        {scanning ? t`Scanning…` : t`Scan`}
      </button>
      <span className='mx-1.5 h-5 w-px bg-line' />
      <span
        role='group'
        aria-label={t`How files are shown`}
        className='inline-flex gap-1'>
        {VIEWS.map(([option, name, icon]) => (
          <button
            key={option}
            type='button'
            aria-pressed={view === option}
            aria-label={i18n._(name)}
            title={i18n._(name)}
            onClick={() => setFileView(option)}
            className={`inline-flex h-control w-control items-center justify-center rounded-corner ${
              view === option ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-well'
            }`}>
            <Icon name={icon} />
          </button>
        ))}
      </span>
      {view === 'grid' && (
        <label
          title={t`Thumbnail size — or Ctrl/⌘ and the mouse wheel over the thumbnails`}
          className='ml-2 inline-flex items-center gap-1.5 text-small text-ink-3'>
          <span aria-hidden='true'>▫</span>
          <input
            type='range'
            aria-label={t`Thumbnail size`}
            min={TILE_SIZE.min}
            max={TILE_SIZE.max}
            step={TILE_SIZE.step}
            value={tileSize}
            onChange={(e) => setTileSize(Number(e.target.value))}
            className='w-24 accent-accent'
          />
          <span aria-hidden='true'>◻</span>
        </label>
      )}
      <span className='flex-1' />
      <FindAnything find={find} />
      <span className='flex-1' />
      <button
        type='button'
        aria-label={t`Keyboard shortcuts`}
        title={t`Keyboard shortcuts (?)`}
        onClick={onShortcuts}
        className={`${TOOL} w-control justify-center px-0`}>
        <Icon
          name='keyboard'
          className='text-ink-2'
        />
      </button>
      <SettingsMenu>
        {(close) => (
          <>
            <SettingsRow label={t`Theme`}>
              <Seg
                label={t`Theme`}
                value={theme}
                options={said(THEMES)}
                onPick={setTheme}
              />
            </SettingsRow>
            <SettingsRow label={t`Language`}>
              <Seg
                label={t`Language`}
                value={language}
                options={LANGUAGE_NAMES}
                onPick={speakIn}
              />
            </SettingsRow>
            <div className='flex flex-col border-t border-line-2 pt-2'>
              <MenuItem
                title={t`The editing templates a montage is made from — look them over, or bring one in`}
                onClick={() => {
                  close()
                  onTemplates()
                }}>
                {t`Templates…`}
              </MenuItem>
              <MenuItem
                title={t`The folder SkyDock keeps its work in — the originals, what is handed over, the board — and another one to work in`}
                onClick={() => {
                  close()
                  onWorkFolder()
                }}>
                {t`Work folder…`}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  onShortcuts()
                }}>
                {t`Keyboard shortcuts…`}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  onAbout()
                }}>
                {t`About SkyDock…`}
              </MenuItem>
            </div>
          </>
        )}
      </SettingsMenu>
      <span className='mx-1.5 h-5 w-px bg-line' />
      <DetailsToggle />
      <span className='min-w-3 self-stretch' />
      <span className='relative z-40 flex items-center gap-1'>
        <WindowControls />
      </span>
    </header>
  )
}

const DetailsToggle = () => {
  const column = useDetailsColumn()
  const drawer = useDetailsDrawer()
  const one = (open: boolean, set: (open: boolean) => void, only: string) => (
    <button
      type='button'
      aria-pressed={open}
      aria-label={open ? t`Hide details` : t`Details`}
      title={open ? t`Hide details` : t`Details`}
      onClick={() => set(!open)}
      className={`${TOOL} w-control justify-center px-0 ${only} ${open ? 'bg-accent-soft hover:bg-accent-soft' : ''}`}>
      <Icon
        name='details'
        className={open ? 'text-accent' : 'text-ink-2'}
      />
    </button>
  )
  return (
    <>
      {one(column, setDetailsColumn, 'max-wide:hidden')}
      {one(drawer, setDetailsDrawer, 'wide:hidden')}
    </>
  )
}

const StatusBar = ({
  proxies,
  jumps,
  disk,
  nas,
  transfers,
  doing
}: {
  proxies: { ready: number; waiting: number; total: number }
  jumps: { read: number; total: number }
  disk?: { free: number; level: 'ok' | 'low' | 'full' } | null
  nas: { connected: boolean; host: string | null; user: string | null; links: NasLink[] }
  transfers: { open: boolean; onToggle: () => void }
  doing?: string | null
}) => {
  const zoom = useZoom()
  const going = useJobs().find((job) => job.stage !== 'failed')
  const working = going ? headlineOf(going) : null
  const left = disk ? formatSize(disk.free) : ''
  const { ready, total, waiting } = proxies
  const { read, total: clips } = jumps
  const host = nas.host ?? t`the storage`
  const user = nas.user
  const item = 'inline-flex h-5 items-center gap-1.75 whitespace-nowrap'
  return (
    <footer className='drag-region mx-2.5 mb-2 desk:mx-0 desk:mb-0 desk:rounded-none flex h-control-sm flex-none items-center gap-5 rounded-corner relative z-30 isle-foot px-3.5 desk:rounded-t-none text-micro font-semibold text-ink-2'>
      <span
        title={
          nas.connected
            ? user
              ? t`Connected to ${host} as ${user}`
              : t`Connected to ${host}`
            : t`Not connected to the storage`
        }
        className={item}>
        <span
          className={`size-1.75 flex-none rounded-full ${nas.connected ? 'bg-dot-up' : 'bg-ink-3'}`}
        />
        {nas.connected && (
          <span className='max-w-60 truncate'>
            {user ? `${user} @ ${shortHost(host)}` : shortHost(host)}
          </span>
        )}
        {nas.links.map((link) => (
          <button
            key={link.label}
            type='button'
            aria-label={link.mark ? link.label : undefined}
            title={link.title ?? link.label}
            disabled={link.disabled}
            onClick={link.onClick}
            className={
              link.mark
                ? 'grid size-mark place-items-center rounded-corner text-ink-2 hover:bg-line hover:text-ink disabled:opacity-40'
                : 'text-accent-ink hover:underline disabled:opacity-60 disabled:no-underline'
            }>
            {link.mark === '⟳' ? (
              <Icon
                name='scan'
                size={12}
                weight={2}
              />
            ) : link.mark === '⏻' ? (
              <Icon
                name='eject'
                size={12}
                weight={2}
              />
            ) : (
              (link.mark ?? link.label)
            )}
          </button>
        ))}
      </span>
      <button
        type='button'
        aria-pressed={transfers.open}
        title={t`What was sent and copied in, and how it went — even when it is all done`}
        onClick={transfers.onToggle}
        className={`${item} rounded-corner px-1.5 hover:bg-line hover:text-ink ${transfers.open ? 'bg-line text-ink' : ''}`}>
        <Icon
          name='upload'
          size={12}
          weight={2}
        />
        {t`Transfers`}
      </button>
      {doing && (
        <span
          role='status'
          className={`${item} text-ink`}>
          <Spinner />
          {doing}
        </span>
      )}
      {working && (
        <span className={`${item} text-ink`}>
          <Icon
            name={working.icon}
            size={12}
            weight={2}
            className='text-accent'
          />
          {working.what}
          <span className='ml-px h-1 w-20 flex-none overflow-hidden rounded-corner bg-line'>
            <i
              className='block h-full bg-accent'
              style={{ width: `${Math.round(working.part * 100)}%` }}
            />
          </span>
        </span>
      )}
      {disk && disk.level !== 'ok' && (
        <span
          role='alert'
          title={
            disk.level === 'full'
              ? t`Copying a camera, making proxies, processing and saving the board all need room on this disk. Free some space: delete what you no longer need, or free uploaded jumps and montages from here.`
              : t`Free some space before the disk fills: copying a camera, making proxies and processing all need room.`
          }
          className={`${item} font-medium ${disk.level === 'full' ? 'text-bin' : 'text-local'}`}>
          {disk.level === 'full'
            ? t`⚠ Disk full — ${left} left: copying, proxies and saving will fail`
            : t`⚠ Disk almost full — ${left} left`}
        </span>
      )}
      <span className='flex-1' />
      {waiting > 0 && (
        <span
          title={t`${ready} of ${total} clips have their small copy. They are built in the background; the count catches up whenever the board is redrawn.`}
          className={item}>
          <Spinner />
          {t`Proxies ready ${ready}/${total}`}
        </span>
      )}
      {read < clips && (
        <span
          title={t`${read} of ${clips} clips have been read for where the jump is in them. They are read in the background; each clip says how far it has got.`}
          className={item}>
          <Spinner />
          {t`Marks found ${read}/${clips}`}
          <span className='ml-px h-1 w-20 flex-none overflow-hidden rounded-corner bg-line'>
            <i
              className='block h-full bg-accent transition-[width] duration-500'
              style={{ width: `${Math.round((read / clips) * 100)}%` }}
            />
          </span>
        </span>
      )}
      {zoom && (
        <span
          role='group'
          aria-label={t`Size of the board`}
          title={t`How big the whole board is drawn — or ⌘/ctrl with + and −, and 0 for as drawn. Kept for next time.`}
          className={item}>
          <button
            type='button'
            aria-label={t`Smaller`}
            disabled={zoom.factor <= 0.5}
            onClick={zoom.smaller}
            className='grid size-mark place-items-center rounded-corner hover:bg-line disabled:opacity-40'>
            −
          </button>
          <button
            type='button'
            aria-label={t`As drawn`}
            title={t`Back to as drawn`}
            onClick={zoom.asDrawn}
            className='tabular-nums hover:text-ink'>
            {Math.round(zoom.factor * 100)}%
          </button>
          <button
            type='button'
            aria-label={t`Bigger`}
            disabled={zoom.factor >= 3}
            onClick={zoom.bigger}
            className='grid size-mark place-items-center rounded-corner hover:bg-line disabled:opacity-40'>
            +
          </button>
        </span>
      )}
    </footer>
  )
}

export { DetailsToggle, BoardHeader, StatusBar }
export type { NasLink }
