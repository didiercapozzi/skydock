import { plural, t } from '@lingui/core/macro'
import { isVideoFile, passengerOf } from '@skydock/scripts'
import { useState } from 'react'
import { Link } from 'react-router'
import { parcelsOfGroup } from '../helpers/parcels'
import { placeHref } from '../helpers/places'
import { useBoard } from '../hooks/useBoardModel'
import { Mini } from './buttons'
import { ParcelCards } from './montage-card'
import { kindsSaid } from './kinds'
import type { ManifestGroup } from './types'
import { dayShort, formatSize, minFileMtime } from './utils'

/* The montages that are done (RULES, Montages done): freed from this machine, so that all there is of
   each is on the storage. One row each — who it was for, which day, when it was emailed, how
   much is up there, whether its link still works — and the way to its page, where what the storage holds
   of it can be looked at. */

/* each name its own colour, so a list of them is told apart at a glance */
const AVATARS = [
  'bg-[linear-gradient(135deg,#0e7a8f,#5cc0cf)]',
  'bg-[linear-gradient(135deg,#7a5ad2,#b3a0ef)]',
  'bg-[linear-gradient(135deg,#d98a3a,#f0b877)]',
  'bg-[linear-gradient(135deg,#1f8a5a,#6fcf9f)]'
]
const avatarOf = (name: string) =>
  AVATARS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATARS.length]

const COLUMNS =
  'grid grid-cols-[minmax(150px,2.2fr)_1.1fr_1fr_1.1fr_auto] items-center gap-x-4 px-5'

const DeliveredList = ({ groups, query = '' }: { groups: ManifestGroup[]; query?: string }) => {
  const model = useBoard()
  /* the montages whose storage cards are open under their row */
  const [shown, setShown] = useState<Set<string>>(new Set())
  const byName = new Map<string, ManifestGroup[]>()
  for (const g of groups) byName.set(passengerOf(g), [...(byName.get(passengerOf(g)) ?? []), g])
  const rows = [...byName]
    .filter(([name]) => name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
  if (rows.length === 0) return <p className='m-0 px-7 text-ink-3'>{t`No montage is done yet`}</p>
  return (
    <div className='flex min-h-full flex-col gap-3'>
      <div>
        <div
          className={`${COLUMNS} pb-2 text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase`}>
          <span>{t`Montage`}</span>
          <span>{t`Day`}</span>
          <span>{t`Emailed`}</span>
          <span>{t`On the storage`}</span>
          <span>{t`Link`}</span>
        </div>
        <ul className='m-0 flex list-none flex-col overflow-hidden rounded-[18px] bg-pane p-0 shadow-[0_0_0_1px_var(--color-line)]'>
          {rows.map(([name, jumps]) => {
            const files = jumps.flatMap((g) => g.files)
            const videos = files.filter((f) => isVideoFile(f.path)).length
            const emailed = jumps
              .map((g) => model.emailedOn(g)?.at ?? 0)
              .reduce((a, b) => Math.max(a, b), 0)
            const parcels = jumps.flatMap((g) => parcelsOfGroup(g, model.board.places))
            const size = parcels
              .flatMap((p) => p.items)
              .reduce((n, item) => n + (item.size ?? 0), 0)
            const linked = jumps.some((g) => g.uploaded?.shareUrl ?? g.publish?.shareUrl)
            const first = jumps[0]
            return (
              <li
                key={name}
                className={`${COLUMNS} border-t border-line-2 py-3 first:border-t-0`}>
                <span className='flex min-w-0 items-center gap-3.5'>
                  <span
                    aria-hidden='true'
                    className={`grid size-11 flex-none place-items-center rounded-[14px] font-display text-[18px] font-semibold text-white ${avatarOf(name)}`}>
                    {name.charAt(0).toUpperCase()}
                  </span>
                  <span className='min-w-0'>
                    <b className='block truncate font-display text-[16px] font-semibold tracking-[-0.02em]'>
                      {name}
                    </b>
                    <span className='block truncate text-[12px] text-ink-3'>
                      {kindsSaid(videos, files.length - videos, ' · ') ||
                        plural(files.length, { one: '# file', other: '# files' })}
                    </span>
                  </span>
                </span>
                <span className='text-[14px]'>
                  {first ? dayShort(minFileMtime(first.files) ?? 0) : ''}
                </span>
                <span className='text-[14px]'>{emailed ? dayShort(emailed) : '—'}</span>
                <b className='text-[14px] tabular-nums'>{size ? formatSize(size) : '—'}</b>
                <span className='flex items-center gap-3'>
                  <span
                    className={`inline-flex h-6 w-[88px] items-center justify-center rounded-full text-[12px] font-bold ${
                      linked ? 'bg-up-soft text-up' : 'bg-well text-ink-2'
                    }`}>
                    {linked ? t`active` : t`no link`}
                  </span>
                  <Mini
                    pressed={shown.has(name)}
                    title={t`Where its files are on the storage: each folder, what is in it and how big`}
                    onClick={() =>
                      setShown((now) => {
                        const next = new Set(now)
                        if (!next.delete(name)) next.add(name)
                        return next
                      })
                    }>
                    {t`Storage`}
                  </Mini>
                  <Link
                    to={placeHref({ kind: 'pax', name })}
                    className='no-underline [&>button]:h-[34px] [&>button]:px-4'>
                    <Mini>{t`Open`}</Mini>
                  </Link>
                </span>
                {shown.has(name) && (
                  <div className='col-span-full pt-1 pb-2'>
                    <p className='m-0 mb-1 text-[12.5px] text-ink-3'>
                      {t`On this machine: nothing — everything is on the storage.`}
                    </p>
                    <ParcelCards
                      parcels={parcels}
                      dsmHost={model.nas.host}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      <p className='m-0 mt-auto pt-6 text-[12.5px] text-ink-3'>
        {t`A montage comes here by itself once it is freed from this machine. Press Storage to see where its files are on the storage, or Open for its page.`}
      </p>
    </div>
  )
}

export { DeliveredList }
