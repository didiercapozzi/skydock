import { plural, t } from '@lingui/core/macro'
import type { MontageEntry, MontageLost } from '@skydock/scripts'
import { useState } from 'react'
import { goneSent, lostOf } from '@skydock/scripts'
import { parcelsOfEntry, parcelsOfGroup } from '../helpers/parcels'
import { Go } from './buttons'
import { Icon } from './icons'
import { dsmFolderUrl } from '../helpers/dsm'
import { ParcelCards } from './montage-card'
import { Menu, MenuItem } from './settings-menu'
import type { ManifestGroup } from './types'
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
  group,
  dsmHost,
  remote,
  lost,
  waiting,
  onEmail,
  onLink,
  onRestore
}: {
  entry: MontageEntry
  /* the storage's own address, for showing a file in its web interface */
  dsmHost?: string | null
  /* what the storage was last found to hold */
  remote?: { dirs: string[]; sizes: Record<string, number | null> } | null
  /* the montage on this board, when it is still there: what its upload recorded says the most */
  group?: ManifestGroup
  /* what the storage no longer holds of it: its folder, or only its link */
  lost: 'folder' | 'link' | null
  /* how many of its files are on this board waiting to be sorted — a board that forgot it */
  waiting: number
  onEmail: () => void
  /* a link to the montage's folder made, or taken away */
  onLink: (make: boolean) => void
  onRestore: () => void
}) => {
  const [copied, setCopied] = useState(false)
  /* its folder on the storage, listed under it: the film and photos, to be watched from here */
  /* how it was handed over: each folder up there, what is in it and what is inside each zip — kept
     by the storage's list, so it is there for a montage freed from this machine or made on another */
  const [detailed, setDetailed] = useState(false)
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
  const { videos, photos, folder } = entry
  const uploadedOn = localeDate(entry.uploadedAt)
  const emailedTo = entry.emailed?.to
  const emailedOn = entry.emailed ? localeDate(entry.emailed.at) : ''
  /* a link that works: one the storage no longer honours is as good as none */
  const hasLink = !!entry.shareUrl && !lost
  const who = `${entry.firstname} ${entry.lastname}`.trim()
  return (
    <div>
      {/* pressing the row opens and closes what was handed over; what is on it keeps doing its own */}
      <div
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest('button, a, [role=group]'))
            setDetailed(!detailed)
        }}
        className='flex min-h-[60px] cursor-pointer flex-wrap items-center gap-x-3.5 gap-y-1 rounded-[13px] px-3 py-2 hover:bg-well'>
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
          {/* the storage's own web interface, on the folder this montage went to */}
          {dsmHost && lost !== 'folder' && dsmFolderUrl(dsmHost, folder) && (
            <a
              href={dsmFolderUrl(dsmHost, folder) ?? undefined}
              target='_blank'
              rel='noreferrer'
              title={t`Show its folder in the storage’s own web interface, in a new tab`}
              className='inline-flex h-[30px] items-center justify-center gap-1.5 rounded-[10px] bg-well px-3 text-[12.5px] font-bold whitespace-nowrap text-ink no-underline hover:bg-line'>
              {t`Open`}
            </a>
          )}
          {/* the rest, behind three dots: its link and the email */}
          {lost !== 'folder' && (
            <Menu
              label={t`More`}
              icon='more'>
              {(close) => (
                <div className='flex flex-col'>
                  {entry.shareUrl && !lost && (
                    <MenuItem
                      icon='link'
                      title={entry.shareUrl}
                      onClick={() => {
                        void copy()
                        close()
                      }}>
                      {copied ? `✓ ${t`copied`}` : t`Copy link`}
                    </MenuItem>
                  )}
                  {entry.shareUrl && !lost && (
                    <MenuItem
                      icon='mail'
                      onClick={() => {
                        onEmail()
                        close()
                      }}>
                      {t`Email…`}
                    </MenuItem>
                  )}
                  <MenuItem
                    icon={hasLink ? 'close' : 'plus'}
                    title={
                      hasLink
                        ? t`Take the link away — the folder stays where it is`
                        : t`Make a link to its folder, to send`
                    }
                    onClick={() => {
                      onLink(!hasLink)
                      close()
                    }}>
                    {hasLink ? t`Remove link` : t`Create link`}
                  </MenuItem>
                </div>
              )}
            </Menu>
          )}
        </span>
      </div>
      {/* no box round the row: a line down from its mark, and the cards hung from it, say they are its */}
      {detailed && (
        <div className='mb-3 ml-[21px] border-l-2 border-accent/30 pb-1 pl-4'>
          <ParcelCards
            parcels={group?.uploaded ? parcelsOfGroup(group) : parcelsOfEntry(entry)}
            dsmHost={dsmHost}
            gone={new Set(goneSent(group?.uploaded, remote ?? null))}
          />
        </div>
      )}
    </div>
  )
}

const StorageList = ({
  storage,
  dsmHost,
  remote,
  isHere,
  groupOf,
  waitingFiles,
  onEmail,
  onLink,
  onRestore
}: {
  /* the storage's own address, for showing a file in its web interface */
  dsmHost?: string | null
  /* what the storage was last found to hold, to say what of an upload is gone */
  remote?: { dirs: string[]; sizes: Record<string, number | null> } | null
  storage: {
    dir: string
    montages: MontageEntry[]
    lost: MontageLost
    problem: string | null
  } | null
  /* whether this montage is still on this board, and the name to open it under */
  isHere: (entry: MontageEntry) => boolean
  /* the montage on this board, for the upload it recorded */
  groupOf: (entry: MontageEntry) => ManifestGroup | undefined
  /* how many of a montage's files are on this board, still to be sorted */
  waitingFiles: (entry: MontageEntry) => number
  onEmail: (entry: MontageEntry) => void
  /* a link to its folder made, or taken away */
  onLink: (entry: MontageEntry, make: boolean) => void
  /* put these montages back on the board, by their folder on the storage */
  onRestore: (folders: string[]) => void
}) => {
  if (!storage) return null
  /* A folder the storage no longer holds is an earlier delivery — a montage sent to another
     destination, or sent again, and since taken away. The list keeps it, for it says who was emailed,
     but it is not shown among what is there. */
  const present = storage.montages.filter((m) => lostOf(storage.lost, m.folder) !== 'folder')
  const forgotten = present.filter((m) => !isHere(m) && waitingFiles(m) > 0)
  const waiting = present.filter((m) => !m.emailed).length
  const count = present.length
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
      ) : present.length === 0 ? (
        <p className='m-0 mt-2 rounded-2xl border-2 border-dashed border-line-strong px-3 py-5 text-center text-[12.5px] text-ink-3'>
          {t`No montage uploaded yet — each one is listed here once it is.`}
        </p>
      ) : (
        <div>
          {present.map((entry) => (
            <Row
              key={entry.folder}
              entry={entry}
              group={groupOf(entry)}
              dsmHost={dsmHost}
              remote={remote}
              lost={lostOf(storage.lost, entry.folder)}
              waiting={isHere(entry) ? 0 : waitingFiles(entry)}
              onEmail={() => onEmail(entry)}
              onLink={(make) => onLink(entry, make)}
              onRestore={() => onRestore([entry.folder])}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export { StorageList }
