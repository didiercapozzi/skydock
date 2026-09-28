import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { keepLanguage, spokenNow } from '../helpers/language'
import type { Language } from '../helpers/language'
import { Seg } from './buttons'
import { setFileView, useFileView } from '../hooks/useFileView'
import { useZoom } from '../hooks/useZoom'
import { setTileSize, TILE_SIZE, useTileSize } from '../hooks/useTileSize'
import { setTheme, useTheme } from '../hooks/useTheme'
import { formatSize } from './utils'

const VIEWS = [
  ['rows', msg`Rows`, '☰'],
  ['grid', msg`Thumbnails`, '▦']
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

const BoardHeader = ({
  scanning,
  onScan,
  onTemplates,
  onWorkFolder,
  proxies,
  disk,
  nas
}: {
  scanning: boolean
  onScan: () => void
  /* the editing templates: looked over, and new ones brought in */
  onTemplates: () => void
  /* the folder SkyDock works in, and another one to work in */
  onWorkFolder: () => void
  proxies: { ready: number; waiting: number; total: number }
  /* the room left on the output folder's disk; said only once it runs low */
  disk?: { free: number; level: 'ok' | 'low' | 'full' } | null
  nas: { connected: boolean; host: string | null; user: string | null; links: NasLink[] }
}) => {
  const view = useFileView()
  const tileSize = useTileSize()
  const zoom = useZoom()
  const theme = useTheme()
  const language = spokenNow()
  /* named, so a translator reads what each one is */
  const left = disk ? formatSize(disk.free) : ''
  const { ready, total } = proxies
  const host = nas.host ?? t`the storage`
  const user = nas.user
  /* kept for the server too, and the page drawn again in it, from the server — what is going on
     there, an upload or a copy, is taken up again as after any reload */
  const speakIn = (next: Language) => {
    keepLanguage(next)
    window.location.reload()
  }
  return (
    <header className='flex flex-wrap items-center gap-[13px] border-b border-line bg-pane px-4 py-[9px]'>
      <span className='text-[15px] font-bold tracking-[-0.02em]'>
        Sky<span className='text-accent'>Dock</span>
      </span>
      {disk && disk.level !== 'ok' && (
        <span
          role='alert'
          title={
            disk.level === 'full'
              ? t`Copying a camera, making proxies, processing and saving the board all need room on this disk. Free some space: delete what you no longer need, or free uploaded jumps and montages from here.`
              : t`Free some space before the disk fills: copying a camera, making proxies and processing all need room.`
          }
          className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap ${
            disk.level === 'full'
              ? 'border-changed bg-changed text-white'
              : 'border-local bg-local-soft text-local'
          }`}>
          {disk.level === 'full'
            ? t`⚠ Disk full — ${left} left: copying, proxies and saving will fail`
            : t`⚠ Disk almost full — ${left} left`}
        </span>
      )}
      <span className='ml-auto flex flex-wrap items-center gap-2'>
        <button
          type='button'
          disabled={scanning}
          onClick={onScan}
          title={t`Copy what is new on every camera plugged in — what is here already is passed over — and look through the output folder for files the board does not know yet`}
          className='rounded-md border border-line bg-pane px-[11px] py-[5px] text-[12.5px] font-medium hover:border-ink-3 disabled:opacity-40'>
          {scanning ? t`Scanning…` : t`Rescan cameras`}
        </button>
        <button
          type='button'
          onClick={onTemplates}
          title={t`The editing templates a montage is made from — look them over, or bring one in`}
          className='rounded-md border border-line bg-pane px-[11px] py-[5px] text-[12.5px] font-medium hover:border-ink-3'>
          {t`Templates…`}
        </button>
        <button
          type='button'
          onClick={onWorkFolder}
          title={t`The folder SkyDock keeps its work in — the originals, what is handed over, the board — and another one to work in`}
          className='rounded-md border border-line bg-pane px-[11px] py-[5px] text-[12.5px] font-medium hover:border-ink-3'>
          {t`Work folder…`}
        </button>
        {/* Only while some clip is still without one. They are built behind whatever asked for
            them and nothing watches them arrive, so this is how far along the last look was. */}
        {proxies.waiting > 0 && (
          <span
            title={t`${ready} of ${total} clips have their small copy. They are built in the background; the count catches up whenever the board is redrawn.`}
            className='inline-flex items-center gap-1.5 rounded-full border border-line bg-pane px-2.5 py-[3px] font-mono text-[12px] text-ink-2 tabular-nums'>
            {t`proxies ${ready}/${total}`}
          </span>
        )}
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
          className='inline-flex items-center gap-2 rounded-full border border-line bg-pane py-[3px] pr-1.5 pl-2 text-[12px]'>
          <span
            className={`h-[7px] w-[7px] flex-none rounded-full ${
              nas.connected ? 'bg-up' : 'bg-ink-3'
            }`}
          />
          {nas.connected && (
            <span className='max-w-[15rem] truncate'>
              {nas.user && <b className='font-semibold'>{nas.user}</b>}
              {nas.user && <span className='text-ink-3'>@</span>}
              <span className='text-ink-2'>{shortHost(host)}</span>
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
                  ? 'flex h-5 w-5 flex-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-[12.5px] text-ink-2 hover:bg-line-2 hover:text-ink disabled:opacity-40'
                  : 'border-0 bg-transparent px-1 text-[12px] text-accent underline disabled:opacity-40'
              }>
              {link.mark ?? link.label}
            </button>
          ))}
        </span>
        <Seg
          label={t`How files are shown`}
          value={view}
          options={said(VIEWS)}
          onPick={setFileView}
        />
        {/* how big the thumbnails are, while they are what is shown — Ctrl or ⌘ with the wheel over
            them does the same */}
        {view === 'grid' && (
          <label
            title={t`Thumbnail size — or Ctrl/⌘ and the mouse wheel over the thumbnails`}
            className='inline-flex items-center gap-1.5 text-[12px] text-ink-3'>
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
        <Seg
          label={t`Theme`}
          value={theme}
          options={said(THEMES)}
          onPick={setTheme}
        />
        <Seg
          label={t`Language`}
          value={language}
          options={LANGUAGE_NAMES}
          onPick={speakIn}
        />
        {/* how big the whole board is drawn, in SkyDock's own window — ⌘/ctrl with + − 0 too */}
        {zoom && (
          <span
            role='group'
            aria-label={t`Size of the board`}
            title={t`How big the whole board is drawn — or ⌘/ctrl with + and −, and 0 for as drawn. Kept for next time.`}
            className='flex items-center overflow-hidden rounded-md border border-line text-[12px]'>
            <button
              type='button'
              aria-label={t`Smaller`}
              disabled={zoom.factor <= 0.5}
              onClick={zoom.smaller}
              className='bg-pane px-[9px] py-[5px] text-ink-2 hover:text-ink disabled:opacity-40'>
              −
            </button>
            <button
              type='button'
              aria-label={t`As drawn`}
              title={t`Back to as drawn`}
              onClick={zoom.asDrawn}
              className='border-x border-line bg-pane px-[7px] py-[5px] font-mono text-[11.5px] text-ink-2 tabular-nums hover:text-ink'>
              {Math.round(zoom.factor * 100)}%
            </button>
            <button
              type='button'
              aria-label={t`Bigger`}
              disabled={zoom.factor >= 3}
              onClick={zoom.bigger}
              className='bg-pane px-[9px] py-[5px] text-ink-2 hover:text-ink disabled:opacity-40'>
              +
            </button>
          </span>
        )}
      </span>
    </header>
  )
}

export { BoardHeader }
export type { NasLink }
