import { plural, t } from '@lingui/core/macro'
import type { MontageEntry, MontageLost } from '@skydock/scripts'
import { useState } from 'react'
import { lastSegment, lostOf } from '@skydock/scripts'
import { Go, Mini } from './buttons'
import { Icon } from './icons'
import { StorageFolder } from './storage-folder'
import { localeDate } from './utils'

/* Every montage the storage's list names: the ones still on this machine and the ones freed from it
   or uploaded from another one. Each says who it was for, when it went up, whether the passenger was
   emailed, and where its link and its backup are — and, when the storage no longer holds its folder
   or no longer honours its link, says that instead of offering what is not there. */

/* a state beside a montage, as a small tinted badge like a file's */
const TAG =
  'inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-bold whitespace-nowrap'

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
  /* named, so a translator reads what each one is */
  const day = jumpDay(entry.day)
  const { videos, photos, folder, backup } = entry
  const uploadedOn = localeDate(entry.uploadedAt)
  const emailedTo = entry.emailed?.to
  const emailedOn = entry.emailed ? localeDate(entry.emailed.at) : ''
  const who = `${entry.firstname} ${entry.lastname}`.trim()
  const backupName = backup ? lastSegment(backup) : ''
  const originals = backup ?? ''
  return (
    <div className=''>
      <div className='flex min-h-[60px] flex-wrap items-center gap-x-3.5 gap-y-1 rounded-[13px] px-3 py-2 hover:bg-well'>
        <Icon
          name='montage'
          size={15}
          className='text-ink-3'
        />
        <span className='min-w-[150px] flex-[1_1_160px]'>
          <b className='text-[14px] font-semibold text-ink'>
            {entry.firstname} {entry.lastname}
          </b>
          <span className='ml-2 text-[12px] font-medium text-ink-3'>{t`jump ${day}`}</span>
        </span>
        <span className='text-[12px] font-medium text-ink-3'>
          {plural(videos, { one: '# video', other: '# videos' })} ·{' '}
          {plural(photos, { one: '# photo', other: '# photos' })}
        </span>
        <span className='text-[12px] font-medium text-ink-3'>{t`uploaded ${uploadedOn}`}</span>
        {entry.emailed ? (
          <span
            title={emailedTo ? t`Emailed to ${emailedTo}` : undefined}
            className={`${TAG} bg-up-soft text-up`}>
            <Icon
              name='check'
              size={11}
              weight={2.5}
            />
            {t`emailed ${emailedOn}`}
          </span>
        ) : (
          <span
            className={`${TAG} bg-local-soft text-local before:size-1.5 before:rounded-full before:bg-current before:content-['']`}>
            {t`not emailed`}
          </span>
        )}
        {entry.freedAt ? (
          <span
            title={t`Freed from the machine that made it — the storage is the only copy`}
            className={`${TAG} bg-well text-ink-2`}>
            <Icon
              name='lock'
              size={11}
              weight={2}
            />
            {t`storage only`}
          </span>
        ) : null}
        {lost === 'folder' ? (
          <span
            title={t`${folder} is not on the storage any more — the list keeps what it said of it`}
            className={`${TAG} bg-local-soft text-local`}>
            {t`no longer on the storage`}
          </span>
        ) : lost === 'link' ? (
          <span
            title={t`The storage no longer honours its link: revoked, or expired`}
            className={`${TAG} bg-local-soft text-local`}>
            {t`link gone`}
          </span>
        ) : null}
        <span className='ml-auto flex flex-wrap items-center gap-1.5'>
          {waiting > 0 && (
            <Go
              title={t`Its files are on this board, waiting to be sorted: put them back together as ${who}’s montage, at the times they had`}
              onClick={onRestore}>
              {t`Restore · ${plural(waiting, { one: '# file', other: '# files' })}`}
            </Go>
          )}
          {lost !== 'folder' && (
            <Mini
              title={t`List what its folder on the storage holds, and watch it from here`}
              onClick={() => setWatching(!watching)}>
              {watching ? t`Hide files` : t`Watch…`}
            </Mini>
          )}
          {here && (
            <Mini
              title={t`Open it on this board`}
              onClick={onOpen}>
              {t`Open`}
            </Mini>
          )}
          {entry.backup && (
            <Mini
              title={t`The originals: ${originals}`}
              onClick={() =>
                void navigator.clipboard?.writeText(entry.backup ?? '').catch(() => undefined)
              }>
              {t`Backup · ${backupName}`}
            </Mini>
          )}
          {entry.shareUrl && !lost && (
            <Mini
              title={entry.shareUrl}
              onClick={() => void copy()}>
              {copied ? `✓ ${t`copied`}` : t`Copy link`}
            </Mini>
          )}
          {entry.shareUrl && !lost && <Mini onClick={onEmail}>{t`Email…`}</Mini>}
        </span>
      </div>
      {watching && lost !== 'folder' && (
        <div className='pb-3 pl-[29px]'>
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
  const forgotten = storage.montages.filter((m) => !isHere(m) && waitingFiles(m) > 0)
  const waiting = storage.montages.filter((m) => !m.emailed).length
  const count = storage.montages.length
  const lostCount = forgotten.length
  const problem = storage.problem ?? ''
  return (
    <section className='mt-5'>
      <div className='flex flex-wrap items-center gap-3 pt-1 pb-2'>
        <h3 className='m-0 font-display text-[20px] font-bold tracking-[-0.03em] text-ink'>{t`On the storage`}</h3>
        <span className='text-[13.5px] font-medium text-ink-3'>
          {plural(count, { one: '# montage', other: '# montages' })}
          {waiting > 0 ? ` · ${t`${waiting} not emailed yet`}` : ''}
        </span>
        <code className='ml-auto font-mono text-[11.5px] text-ink-3'>{storage.dir}</code>
      </div>
      {/* a board scanned again from nothing: the storage remembers what it has forgotten */}
      {forgotten.length > 1 && (
        <p className='m-0 mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-well px-3 py-2 text-[12.5px] text-ink-2'>
          <span className='flex-1'>
            {t`${lostCount} montages on this list have their files on this board, waiting to be sorted — this board has forgotten them.`}
          </span>
          <Go onClick={() => onRestore(forgotten.map((m) => m.folder))}>
            {t`Restore all ${lostCount}`}
          </Go>
        </p>
      )}
      {storage.problem ? (
        <p className='m-0 mt-2 rounded-xl bg-local-soft px-3.5 py-2.5 text-[12.5px] text-local'>
          {t`The storage’s list of montages could not be read: ${problem}`}
        </p>
      ) : storage.montages.length === 0 ? (
        <p className='m-0 mt-2 rounded-2xl border-2 border-dashed border-line-strong px-3 py-5 text-center text-[12.5px] text-ink-3'>
          {t`No montage uploaded yet — each one is listed here once it is.`}
        </p>
      ) : (
        <div>
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
