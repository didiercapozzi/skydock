import type { TandemEntry } from '@skydock/scripts'
import { useState } from 'react'
import { Mini } from './buttons'

/* Every tandem the storage holds, from its own list: the ones still on this machine and the ones
   freed from it or delivered from another one. Each says who it was for, when it went up, whether
   the passenger was emailed, and where its link and its backup are. */

const date = (epoch: number) => new Date(epoch * 1000).toLocaleDateString('de-CH')

/* the day of the jump, 01.08.2026, read the way the list writes it */
const jumpDay = (day: string) => day.replace(/^0/, '').replace(/\.0/, '.')

const nameOf = (remotePath: string) => remotePath.slice(remotePath.lastIndexOf('/') + 1)

const Row = ({
  entry,
  here,
  onOpen,
  onEmail
}: {
  entry: TandemEntry
  here: boolean
  onOpen: () => void
  onEmail: () => void
}) => {
  const [copied, setCopied] = useState(false)
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
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-2 px-3 py-2 last:border-b-0'>
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
      <span className='text-[12px] text-ink-2'>uploaded {date(entry.uploadedAt)}</span>
      {entry.emailed ? (
        <span
          title={entry.emailed.to ? `Emailed to ${entry.emailed.to}` : undefined}
          className='rounded-full bg-up-soft px-2 py-px text-[11px] font-semibold text-up'>
          ✓ emailed {date(entry.emailed.at)}
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
      <span className='ml-auto flex flex-wrap items-center gap-1.5'>
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
            Backup · {nameOf(entry.backup)}
          </Mini>
        )}
        {entry.shareUrl && (
          <Mini
            title={entry.shareUrl}
            onClick={() => void copy()}>
            {copied ? '✓ copied' : 'Copy link'}
          </Mini>
        )}
        {entry.shareUrl && <Mini onClick={onEmail}>Email…</Mini>}
      </span>
    </div>
  )
}

const StorageList = ({
  storage,
  isHere,
  onOpen,
  onEmail
}: {
  storage: { dir: string; tandems: TandemEntry[]; problem: string | null } | null
  /* whether this tandem is still on this board, and the name to open it under */
  isHere: (entry: TandemEntry) => boolean
  onOpen: (entry: TandemEntry) => void
  onEmail: (entry: TandemEntry) => void
}) => {
  if (!storage) return null
  const waiting = storage.tandems.filter((t) => !t.emailed).length
  return (
    <section className='mt-5'>
      <div className='flex flex-wrap items-baseline gap-2 px-0.5 pb-1.5'>
        <h3 className='m-0 text-[13px] font-semibold text-ink'>On the storage</h3>
        <span className='text-[12px] text-ink-2'>
          {storage.tandems.length} tandem{storage.tandems.length === 1 ? '' : 's'}
          {waiting > 0 ? ` · ${waiting} not emailed yet` : ''}
        </span>
        <code className='ml-auto font-mono text-[11px] text-ink-3'>{storage.dir}</code>
      </div>
      {storage.problem ? (
        <p className='m-0 rounded-md bg-local-soft px-3 py-2 text-[12.5px] text-local'>
          The storage’s list of tandems could not be read: {storage.problem}
        </p>
      ) : storage.tandems.length === 0 ? (
        <p className='m-0 rounded-[9px] border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-ink-3'>
          No tandem uploaded yet — each one is listed here once it is.
        </p>
      ) : (
        <div className='overflow-hidden rounded-[9px] border border-line bg-pane'>
          {storage.tandems.map((entry) => (
            <Row
              key={entry.folder}
              entry={entry}
              here={isHere(entry)}
              onOpen={() => onOpen(entry)}
              onEmail={() => onEmail(entry)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export { StorageList }
