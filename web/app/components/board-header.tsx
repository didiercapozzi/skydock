import { Fragment } from 'react'
import { Seg } from './buttons'
import { setFileView, useFileView } from '../hooks/useFileView'
import { setTheme, useTheme } from '../hooks/useTheme'
import { formatSize } from './utils'

const VIEWS = [
  ['rows', 'Rows'],
  ['grid', 'Thumbnails']
] as const

/* Auto is what the machine says. The other two exist because that signal is invisible and is not
   always the machine you think it is — a browser preview inside an editor follows the editor's
   theme, not the desktop's, which is enough to make two windows of the same design disagree. */
const THEMES = [
  ['auto', 'Auto'],
  ['light', 'Light'],
  ['dark', 'Dark']
] as const

/* the storage strip: one row of links, all of which look and behave alike, so they are described
   once and drawn in a loop rather than written out five times */
type NasLink = { label: string; title?: string; disabled?: boolean; onClick: () => void }

const BoardHeader = ({
  scanning,
  onScan,
  onTemplates,
  proxies,
  camera,
  disk,
  nas
}: {
  scanning: boolean
  onScan: () => void
  /* the editing templates: looked over, and new ones brought in */
  onTemplates: () => void
  proxies: { ready: number; waiting: number; total: number }
  /* a camera plugged in and being copied off, while it is */
  camera?: { camera: string; done: number; total: number; copied: number } | null
  /* the room left on the output folder's disk; said only once it runs low */
  disk?: { free: number; level: 'ok' | 'low' | 'full' } | null
  nas: { connected: boolean; host: string | null; links: NasLink[] }
}) => {
  const view = useFileView()
  const theme = useTheme()
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
              ? 'Copying a camera, making proxies, processing and saving the board all need room on this disk. Free some space: delete what you no longer need, or free uploaded jumps and tandems from here.'
              : 'Free some space before the disk fills: copying a camera, making proxies and processing all need room.'
          }
          className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap ${
            disk.level === 'full'
              ? 'border-changed bg-changed text-white'
              : 'border-local bg-local-soft text-local'
          }`}>
          {disk.level === 'full'
            ? `⚠ Disk full — ${formatSize(disk.free)} left: copying, proxies and saving will fail`
            : `⚠ Disk almost full — ${formatSize(disk.free)} left`}
        </span>
      )}
      <span className='ml-auto flex flex-wrap items-center gap-2'>
        <button
          type='button'
          disabled={scanning}
          onClick={onScan}
          title='Look through the output folder for files the manifest does not know about yet'
          className='rounded-md border border-line bg-pane px-[11px] py-[5px] text-[12.5px] font-medium hover:border-ink-3 disabled:opacity-40'>
          {scanning ? 'Scanning…' : 'Rescan cameras'}
        </button>
        <button
          type='button'
          onClick={onTemplates}
          title='The editing templates a montage is made from — look them over, or bring one in'
          className='rounded-md border border-line bg-pane px-[11px] py-[5px] text-[12.5px] font-medium hover:border-ink-3'>
          Templates…
        </button>
        {/* A camera plugged in is copied off by itself; this is it happening, file by file. */}
        {camera && (
          <span
            role='progressbar'
            aria-label={`Copying ${camera.camera}`}
            aria-valuemin={0}
            aria-valuemax={camera.total}
            aria-valuenow={camera.done}
            title={`Copying the camera ${camera.camera} into the originals — ${camera.copied} new so far. It is scanned when done.`}
            className='inline-flex items-center gap-2 rounded-full border border-accent bg-accent-soft px-2.5 py-[3px] text-[12px] text-ink'>
            <span aria-hidden='true'>📷</span>
            <b className='font-semibold'>{camera.camera}</b>
            <span className='h-1 w-16 overflow-hidden rounded-sm bg-line-2'>
              <i
                className='block h-full bg-accent transition-[width] duration-300'
                style={{
                  width: `${camera.total > 0 ? Math.round((camera.done / camera.total) * 100) : 0}%`
                }}
              />
            </span>
            <span className='font-mono text-[11.5px] text-ink-2 tabular-nums'>
              {camera.done}/{camera.total}
            </span>
          </span>
        )}
        {/* Only while some clip is still without one. They are built behind whatever asked for
            them and nothing watches them arrive, so this is how far along the last look was. */}
        {proxies.waiting > 0 && (
          <span
            title={`${proxies.ready} of ${proxies.total} clips have their small copy. They are built in the background; the count catches up whenever the board is redrawn.`}
            className='inline-flex items-center gap-1.5 rounded-full border border-line bg-pane px-2.5 py-[3px] font-mono text-[12px] text-ink-2 tabular-nums'>
            proxies {proxies.ready}/{proxies.total}
          </span>
        )}
        <span className='inline-flex items-center gap-[7px] rounded-full border border-line bg-pane py-[3px] pr-2.5 pl-2 text-[12px]'>
          <span
            className={`h-[7px] w-[7px] flex-none rounded-full ${
              nas.connected ? 'bg-up' : 'bg-ink-3'
            }`}
          />
          {nas.connected && <b className='font-semibold'>{nas.host ?? 'NAS'}</b>}
          {nas.links.map((link, i) => (
            <Fragment key={link.label}>
              {(i > 0 || nas.connected) && <span className='text-line'>|</span>}
              <button
                type='button'
                title={link.title}
                disabled={link.disabled}
                onClick={link.onClick}
                className='border-0 bg-transparent p-0 text-[12px] text-accent underline disabled:opacity-40'>
                {link.label}
              </button>
            </Fragment>
          ))}
        </span>
        <Seg
          label='How files are shown'
          value={view}
          options={VIEWS}
          onPick={setFileView}
        />
        <Seg
          label='Theme'
          value={theme}
          options={THEMES}
          onPick={setTheme}
        />
      </span>
    </header>
  )
}

export { BoardHeader }
export type { NasLink }
