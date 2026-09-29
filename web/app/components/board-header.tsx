import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { keepLanguage, spokenNow } from '../helpers/language'
import type { Language } from '../helpers/language'
import { Seg } from './buttons'
import { FindAnything } from './find-anything'
import type { Found } from './find-anything'
import { Icon } from './icons'
import { MenuItem, SettingsMenu, SettingsRow, TOOL } from './settings-menu'
import { setFileView, useFileView } from '../hooks/useFileView'
import { useCameraCopy } from '../hooks/liveStore'
import { useZoom } from '../hooks/useZoom'
import { setTileSize, TILE_SIZE, useTileSize } from '../hooks/useTileSize'
import { setTheme, useTheme } from '../hooks/useTheme'
import { formatSize } from './utils'

const VIEWS = [
  ['rows', msg`Rows`, 'rows'],
  ['grid', msg`Thumbnails`, 'overview']
] as const

/* Auto is what the machine says. The other two exist because that signal is invisible and is not
   always the machine you think it is — a browser preview inside an editor follows the editor's
   theme, not the desktop's, which is enough to make two windows of the same design disagree. */
const THEMES = [
  ['auto', msg`Auto`, '◐'],
  ['light', msg`Light`, '☀'],
  ['dark', msg`Dark`, '☾']
] as const

/* Each language named in itself, so it is found by whoever reads it (RULES, Languages). */
const LANGUAGE_NAMES = [
  ['en', 'English', 'EN'],
  ['fr', 'Français', 'FR'],
  ['de', 'Deutsch', 'DE']
] as const satisfies readonly (readonly [Language, string, string])[]

/* a choice's name said in the language the app speaks now */
const said = <T extends string>(options: readonly (readonly [T, MessageDescriptor, string])[]) =>
  options.map(([value, name, mark]) => [value, i18n._(name), mark] as const)

/* The storage strip: one row of links, all of which look and behave alike, so they are described
   once and drawn in a loop rather than written out five times. A link with a mark is drawn as the
   mark alone and keeps its label as its name — what it is called when read out and when hovered. */
type NasLink = {
  label: string
  mark?: string
  title?: string
  disabled?: boolean
  onClick: () => void
}

/* The storage as somebody says it out loud: who, and where. The scheme and the port are how a
   machine reaches it and say nothing anyone needs across the top of a screen — they are in the
   title, with the rest of it, for whoever does. */
const shortHost = (host: string) => host.replace(/^https?:\/\//, '').replace(/[:/].*$/, '')

/* The toolbar, across the top under the window's title bar: what applies to the whole board and is
   used every day — the overview, scanning, rows or thumbnails, finding anything — with what is set
   once and then left alone behind Settings, and the keys the board knows beside it (RULES, The
   board). What is going on — the storage, a copy, the proxies, the size — is in the status bar
   along the bottom. */
const BoardHeader = ({
  scanning,
  onScan,
  onTemplates,
  onWorkFolder,
  onHistory,
  onShortcuts,
  onOverview,
  find
}: {
  scanning: boolean
  onScan: () => void
  /* the editing templates: looked over, and new ones brought in */
  onTemplates: () => void
  /* the folder SkyDock works in, and another one to work in */
  onWorkFolder: () => void
  /* the board's earlier states, to go back to one */
  onHistory: () => void
  /* every key the board knows */
  onShortcuts: () => void
  /* every montage in one table, with what is done to many at once */
  onOverview: () => void
  /* anything on the board, by a piece of its name */
  find: (query: string) => Found[]
}) => {
  const view = useFileView()
  const tileSize = useTileSize()
  const theme = useTheme()
  const language = spokenNow()
  /* kept for the server too, and the page drawn again in it, from the server — what is going on
     there, an upload or a copy, is taken up again as after any reload */
  const speakIn = (next: Language) => {
    keepLanguage(next)
    window.location.reload()
  }
  return (
    <header className='flex h-[42px] flex-none items-center gap-1 bar border-b border-line-strong bg-chrome px-2.5'>
      <button
        type='button'
        onClick={onOverview}
        title={t`Every montage in one table: where each has got to, its link, whether it was emailed`}
        className={TOOL}>
        <Icon
          name='overview'
          className='text-ink-2'
        />
        {t`Overview`}
      </button>
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
      <span className='mx-1.5 h-5 w-px bg-line-strong' />
      <span
        role='group'
        aria-label={t`How files are shown`}
        className='inline-flex h-[30px] gap-px rounded-[7px] border border-line-2 bg-well p-[2px]'>
        {VIEWS.map(([option, name, icon]) => (
          <button
            key={option}
            type='button'
            aria-pressed={view === option}
            aria-label={i18n._(name)}
            title={i18n._(name)}
            onClick={() => setFileView(option)}
            className={`inline-flex w-[30px] items-center justify-center rounded-[5px] ${
              view === option
                ? 'bg-pane text-ink shadow-[0_1px_2px_rgba(24,24,27,0.08),0_0_0_1px_rgba(24,24,27,0.04)]'
                : 'text-ink-2 hover:text-ink'
            }`}>
            <Icon
              name={icon}
              size={14}
            />
          </button>
        ))}
      </span>
      {/* how big the thumbnails are, while they are what is shown — Ctrl or ⌘ with the wheel over
          them does the same */}
      {view === 'grid' && (
        <label
          title={t`Thumbnail size — or Ctrl/⌘ and the mouse wheel over the thumbnails`}
          className='ml-2 inline-flex items-center gap-1.5 text-[12px] text-ink-3'>
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
      <span className='mx-1.5 h-5 w-px bg-line-strong' />
      <button
        type='button'
        aria-label={t`Keyboard shortcuts`}
        title={t`Keyboard shortcuts (?)`}
        onClick={onShortcuts}
        className={`${TOOL} w-[30px] justify-center px-0`}>
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
            <div className='flex flex-col border-t border-line pt-2'>
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
                title={t`The board as it was after each of the last changes — go back to one`}
                onClick={() => {
                  close()
                  onHistory()
                }}>
                {t`History…`}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  onShortcuts()
                }}>
                {t`Keyboard shortcuts…`}
              </MenuItem>
            </div>
          </>
        )}
      </SettingsMenu>
    </header>
  )
}

/* The status bar along the bottom: what is going on, said once and always in the same place — the
   storage, as who and where, with the ways to check it again and let it go; what is being copied or
   uploaded; the disk when it runs low; how many clips still wait for their proxy; and how big the
   board is drawn (RULES, The board). */
const StatusBar = ({
  proxies,
  disk,
  nas,
  uploading
}: {
  proxies: { ready: number; waiting: number; total: number }
  /* the room left on the output folder's disk; said only once it runs low */
  disk?: { free: number; level: 'ok' | 'low' | 'full' } | null
  nas: { connected: boolean; host: string | null; user: string | null; links: NasLink[] }
  /* what is going up right now, and how far through, between 0 and 1 */
  uploading: { label: string; part: number } | null
}) => {
  const zoom = useZoom()
  /* a card being copied is heard here, so its bytes move this line and nothing else */
  const copy = useCameraCopy()
  const copyWhat = copy?.camera ?? ''
  const copyDone = copy?.done ?? 0
  const copyTotal = copy?.total ?? 0
  const working = copy
    ? {
        icon: 'copying' as const,
        what: t`${copyWhat} · copying ${copyDone} of ${copyTotal}`,
        part: copyTotal > 0 ? copyDone / copyTotal : 0
      }
    : uploading
      ? {
          icon: 'upload' as const,
          what: t`Uploading ${uploading.label}`,
          part: uploading.part
        }
      : null
  /* named, so a translator reads what each one is */
  const left = disk ? formatSize(disk.free) : ''
  const { ready, total, waiting } = proxies
  const host = nas.host ?? t`the storage`
  const user = nas.user
  const item = 'inline-flex h-5 items-center gap-1.5 px-2 whitespace-nowrap'
  return (
    <footer className='flex h-[26px] flex-none items-center gap-0.5 bar border-t border-line-strong bg-chrome px-2 text-[11.5px] text-ink-2 [&>*+*]:border-l [&>*+*]:border-line-strong'>
      {/* Who the storage was connected as, and where: the same question a NAS asks at its own
          login, answered on the board rather than left to be remembered. */}
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
          className={`size-[7px] flex-none rounded-full ${nas.connected ? 'bg-up' : 'bg-ink-3'}`}
        />
        {nas.connected && (
          <span className='max-w-[15rem] truncate'>
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
                ? 'grid size-[18px] place-items-center rounded-[3px] text-ink-2 hover:bg-line hover:text-ink disabled:opacity-40'
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
      {working && (
        <span className={`${item} text-ink`}>
          <Icon
            name={working.icon}
            size={12}
            weight={2}
            className='text-accent'
          />
          {working.what}
          <span className='h-[3px] w-[70px] flex-none overflow-hidden rounded-sm bg-line'>
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
      <span className='flex-1 !border-l-0' />
      {/* Only while some clip is still without one. They are built behind whatever asked for them
          and nothing watches them arrive, so this is how far along the last look was. */}
      {waiting > 0 && (
        <span
          title={t`${ready} of ${total} clips have their small copy. They are built in the background; the count catches up whenever the board is redrawn.`}
          className={`${item} !border-l-0`}>
          <span className='size-2.5 flex-none animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent' />
          {t`Proxies ready ${ready}/${total}`}
        </span>
      )}
      {/* how big the whole board is drawn, in SkyDock's own window — ⌘/ctrl with + − 0 too */}
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
            className='grid size-[18px] place-items-center rounded-[3px] hover:bg-line disabled:opacity-40'>
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
            className='grid size-[18px] place-items-center rounded-[3px] hover:bg-line disabled:opacity-40'>
            +
          </button>
        </span>
      )}
    </footer>
  )
}

export { BoardHeader, StatusBar }
export type { NasLink }
