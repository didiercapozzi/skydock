import { Fragment } from 'react'
import { Seg } from './buttons'
import { setFileView, useFileView } from '../hooks/useFileView'
import { setTheme, useTheme } from '../hooks/useTheme'

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
  nas
}: {
  scanning: boolean
  onScan: () => void
  /* the editing templates: looked over, and new ones brought in */
  onTemplates: () => void
  proxies: { ready: number; waiting: number; total: number }
  nas: { connected: boolean; host: string | null; links: NasLink[] }
}) => {
  const view = useFileView()
  const theme = useTheme()
  return (
    <header className='flex flex-wrap items-center gap-[13px] border-b border-line bg-pane px-4 py-[9px]'>
      <span className='text-[15px] font-bold tracking-[-0.02em]'>
        Sky<span className='text-accent'>Dock</span>
      </span>
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
