import type { MontageEntry, MontageLost } from '@skydock/scripts'
import { useState } from 'react'
import { lastSegment, lostOf } from '@skydock/scripts'
import { Go, Mini } from './buttons'
import { StorageFolder } from './storage-folder'
import { localeDate } from './utils'

/* Every montage the storage's list names: the ones still on this machine and the ones freed from it
   or uploaded from another one. Each says who it was for, when it went up, whether the passenger was
   emailed, and where its link and its backup are — and, when the storage no longer holds its folder
   or no longer honours its link, says that instead of offering what is not there. */

/* the day of the jump, 01.08.2026, read the way the list writes it */
const jumpDay = (day: string) => day.replace(/^0/, '').replace(/\.0/, '.')

const Row = ({
  entry,
  here,
  lost,
  waiting,
  onOpen,
  onEmail,
  onRestore
}: {
  entry: MontageEntry
  here: boolean
  /* what the storage no longer holds of it: its folder, or only its link */
  lost: 'folder' | 'link' | null
  /* how many of its files are on this board waiting to be sorted — a board that forgot it */
  waiting: number
  onOpen: () => void
  onEmail: () => void
  onRestore: () => void
}) => {
  const [copied, setCopied] = useState(false)
  /* its folder on the storage, listed under it: the film and photos, to be watched from here */
  const [watching, setWatching] = useState(false)
  const copy = async () => {
    if (!entry.shareUrl) return
    try {
      await navigator.clipboard.writeText(entry.shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* the link is in the button's tooltip either way */
    }
  }
  return (
    <div className='border-b border-line-2 last:border-b-0'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2'>
        <span className='min-w-[150px] flex-[1_1_160px]'>
          <b className='text-[13px] font-semibold text-ink'>
            {entry.firstname} {entry.lastname}
          </b>
          <span className='ml-2 text-[12px] text-ink-3'>jump {jumpDay(entry.day)}</span>
        </span>
        <span className='text-[12px] text-ink-2'>
          {entry.videos} video{entry.videos === 1 ? '' : 's'} · {entry.photos} photo
          {entry.photos === 1 ? '' : 's'}
        </span>
        <span className='text-[12px] text-ink-2'>uploaded {localeDate(entry.uploadedAt)}</span>
        {entry.emailed ? (
          <span
            title={entry.emailed.to ? `Emailed to ${entry.emailed.to}` : undefined}
            className='rounded-full bg-up-soft px-2 py-px text-[11px] font-semibold text-up'>
            ✓ emailed {localeDate(entry.emailed.at)}
          </span>
        ) : (
          <span className='rounded-full bg-local-soft px-2 py-px text-[11px] font-semibold text-local'>
            not emailed
          </span>
        )}
        {entry.freedAt ? (
          <span
            title='Freed from the machine that made it — the storage is the only copy'
            className='rounded-full bg-line-2 px-2 py-px text-[11px] text-ink-2'>
            🔒 storage only
          </span>
        ) : null}
        {lost === 'folder' ? (
          <span
            title={`${entry.folder} is not on the storage any more — the list keeps what it said of it`}
            className='rounded-full bg-local-soft px-2 py-px text-[11px] font-semibold text-local'>
            no longer on the storage
          </span>
        ) : lost === 'link' ? (
          <span
            title='The storage no longer honours its link: revoked, or expired'
            className='rounded-full bg-local-soft px-2 py-px text-[11px] font-semibold text-local'>
            link gone
          </span>
        ) : null}
        <span className='ml-auto flex flex-wrap items-center gap-1.5'>
          {waiting > 0 && (
            <Go
              title={`Its files are on this board, waiting to be sorted: put them back together as ${`${entry.firstname} ${entry.lastname}`.trim()}’s montage, at the times they had`}
              onClick={onRestore}>
              Restore · {waiting} file{waiting === 1 ? '' : 's'}
            </Go>
          )}
          {lost !== 'folder' && (
            <Mini
              title='List what its folder on the storage holds, and watch it from here'
              onClick={() => setWatching(!watching)}>
              {watching ? 'Hide files' : 'Watch…'}
            </Mini>
          )}
          {here && (
            <Mini
              title='Open it on this board'
              onClick={onOpen}>
              Open
            </Mini>
          )}
          {entry.backup && (
            <Mini
              title={`The originals: ${entry.backup}`}
              onClick={() =>
                void navigator.clipboard?.writeText(entry.backup ?? '').catch(() => undefined)
              }>
              Backup · {lastSegment(entry.backup)}
            </Mini>
          )}
          {entry.shareUrl && !lost && (
            <Mini
              title={entry.shareUrl}
              onClick={() => void copy()}>
              {copied ? '✓ copied' : 'Copy link'}
            </Mini>
          )}
          {entry.shareUrl && !lost && <Mini onClick={onEmail}>Email…</Mini>}
        </span>
      </div>
      {watching && lost !== 'folder' && (
        <div className='px-3 pb-3'>
          <StorageFolder where={{ folder: entry.folder }} />
        </div>
      )}
    </div>
  )
}

const StorageList = ({
  storage,
  isHere,
  waitingFiles,
  onOpen,
  onEmail,
  onRestore
}: {
  storage: {
    dir: string
    montages: MontageEntry[]
    lost: MontageLost
    problem: string | null
  } | null
  /* whether this montage is still on this board, and the name to open it under */
  isHere: (entry: MontageEntry) => boolean
  /* how many of a montage's files are on this board, still to be sorted */
  waitingFiles: (entry: MontageEntry) => number
  onOpen: (entry: MontageEntry) => void
  onEmail: (entry: MontageEntry) => void
  /* put these montages back on the board, by their folder on the storage */
  onRestore: (folders: string[]) => void
}) => {
  if (!storage) return null
  const forgotten = storage.montages.filter((t) => !isHere(t) && waitingFiles(t) > 0)
  const waiting = storage.montages.filter((t) => !t.emailed).length
  return (
    <section className='mt-5'>
      <div className='flex flex-wrap items-baseline gap-2 px-0.5 pb-1.5'>
        <h3 className='m-0 text-[13px] font-semibold text-ink'>On the storage</h3>
        <span className='text-[12px] text-ink-2'>
          {storage.montages.length} montage{storage.montages.length === 1 ? '' : 's'}
          {waiting > 0 ? ` · ${waiting} not emailed yet` : ''}
        </span>
        <code className='ml-auto font-mono text-[11px] text-ink-3'>{storage.dir}</code>
      </div>
      {/* a board scanned again from nothing: the storage remembers what it has forgotten */}
      {forgotten.length > 1 && (
        <p className='m-0 mb-2 flex flex-wrap items-center gap-2 rounded-r-md border-l-[3px] border-accent bg-accent-soft px-3 py-2 text-[12.5px] text-ink-2'>
          <span className='flex-1'>
            {forgotten.length} montages on this list have their files on this board, waiting to be
            sorted — this board has forgotten them.
          </span>
          <Go onClick={() => onRestore(forgotten.map((t) => t.folder))}>
            Restore all {forgotten.length}
          </Go>
        </p>
      )}
      {storage.problem ? (
        <p className='m-0 rounded-md bg-local-soft px-3 py-2 text-[12.5px] text-local'>
          The storage’s list of montages could not be read: {storage.problem}
        </p>
      ) : storage.montages.length === 0 ? (
        <p className='m-0 rounded-[9px] border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-ink-3'>
          No montage uploaded yet — each one is listed here once it is.
        </p>
      ) : (
        <div className='overflow-hidden rounded-[9px] border border-line bg-pane'>
          {storage.montages.map((entry) => (
            <Row
              key={entry.folder}
              entry={entry}
              here={isHere(entry)}
              lost={lostOf(storage.lost, entry.folder)}
              waiting={isHere(entry) ? 0 : waitingFiles(entry)}
              onOpen={() => onOpen(entry)}
              onEmail={() => onEmail(entry)}
              onRestore={() => onRestore([entry.folder])}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export { StorageList }
