import { fileStatus, hasCompletePassenger, isMontage, passengerOf } from '@skydock/scripts'
import type { StatusContext, MontageEntry, MontageProgress } from '@skydock/scripts'
import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { groupsIn, hereIn, looseIn, placeKey, placeLabel } from '../helpers/places'
import type { Place } from '../helpers/places'
import type { Mounted } from '../hooks/useLiveProgress'
import { PlaceLink } from './place-link'
import { StepMeter } from './montage-steps'
import type { Destination, ManifestFile, ManifestGroup } from './types'

/* The folders, down the left like any file manager's: what is still to sort — and within it what a
   camera's wrong clock dated in the future, to be checked — the dropzones, the passengers, and the
   storage. Each says how many files it holds, how much of it is
   local, processed or uploaded, and how much is still to do — so the state of the whole club is read
   without opening anything. Pinned: only the files scroll, so any folder can take a drop. On a phone
   it becomes one strip of folders across the top. */
type Props = {
  destinations: Destination[]
  groups: ManifestGroup[]
  looseFiles: ManifestFile[]
  storage: { montages: MontageEntry[] } | null
  /* the cameras plugged in right now */
  cameras: Mounted[]
  statusContext: (file: ManifestFile) => StatusContext
  /* whether a montage still has a step to take here */
  montageOpen: (group: ManifestGroup) => boolean
  /* where a passenger has got to — their jump furthest behind */
  passengerProgress: (name: string) => MontageProgress | null
  onAddPlace: (name: string) => void
  dropTarget: (place: Place) => Record<string, unknown>
  overTarget: string | null
  /* the folder something was just filed under, lit for a moment so the eye can follow it there */
  flashPlace?: string | null
}

const Node = ({
  place,
  glyph,
  files,
  todo,
  child,
  statusContext,
  dropTarget,
  over,
  flash,
  progress
}: {
  place: Place
  glyph: string
  files: ManifestFile[]
  /* what is still owed there, in words: "3 to file", "7 to do" */
  todo: string | null
  child?: boolean
  statusContext: (file: ManifestFile) => StatusContext
  dropTarget: (place: Place) => Record<string, unknown>
  over: boolean
  flash?: boolean
  /* a passenger's way through their montage, which says more than how many files are where */
  progress?: MontageProgress | null
}) => {
  const counts = { local: 0, processed: 0, uploaded: 0 }
  for (const file of files) counts[fileStatus(file, statusContext(file))] += 1
  const total = files.length || 1
  const width = (n: number) => `${(n / total) * 100}%`
  const label = placeLabel(place)
  return (
    <PlaceLink
      place={place}
      {...dropTarget(place)}
      className={(current) =>
        `block w-full rounded-md border px-2 pt-1.5 pb-[5px] text-left text-ink max-[780px]:w-auto max-[780px]:flex-none max-[780px]:rounded-full max-[780px]:border-line max-[780px]:bg-pane max-[780px]:px-[11px] max-[780px]:py-[5px] ${
          over
            ? 'border-dashed border-pick bg-pick-soft'
            : current
              ? 'border-line bg-pane shadow-card'
              : 'border-transparent hover:bg-line-2'
        } ${child ? 'pl-[22px] max-[780px]:pl-[11px]' : ''} ${flash ? 'animate-[placeflash_1.8s_ease-out]' : ''}`
      }>
      {(current) => (
        <>
          <span className='flex items-center gap-2 max-[780px]:gap-1.5'>
            <span
              aria-hidden='true'
              className={`w-3.5 flex-none text-center ${current ? 'text-accent' : 'text-ink-3'}`}>
              {glyph}
            </span>
            <span
              className={`min-w-0 flex-1 truncate ${current ? 'font-semibold' : ''}`}
              title={label}>
              {label}
            </span>
            {todo && (
              <span className='flex-none rounded-full bg-local-soft px-1.5 text-[10.5px] font-semibold whitespace-nowrap text-local max-[780px]:hidden'>
                {todo}
              </span>
            )}
            <span className='font-mono text-[11px] text-ink-3 tabular-nums'>{files.length}</span>
          </span>
          {progress ? (
            <StepMeter
              progress={progress}
              className='mt-1 ml-[22px] max-[780px]:hidden'
            />
          ) : (
            files.length > 0 && (
              <span className='mt-1 ml-[22px] flex h-[3px] overflow-hidden rounded-sm bg-line-2 max-[780px]:hidden'>
                <i
                  className='block h-full bg-local'
                  style={{ width: width(counts.local) }}
                />
                <i
                  className='block h-full bg-proc'
                  style={{ width: width(counts.processed) }}
                />
                <i
                  className='block h-full bg-up'
                  style={{ width: width(counts.uploaded) }}
                />
              </span>
            )
          )}
        </>
      )}
    </PlaceLink>
  )
}

const Heading = ({ children }: { children: string }) => (
  <h2 className='mx-2 mt-[15px] mb-1.5 text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase first:mt-[3px] max-[780px]:my-0 max-[780px]:mr-0.5 max-[780px]:ml-1.5 max-[780px]:flex-none max-[780px]:first:ml-0'>
    {children}
  </h2>
)

/* The Montages heading is where a jump is dropped to become a montage, and nothing more: there is no
   page of every montage, because a montage is worked on one passenger at a time. So it takes a drop
   and lights up under one, and a click does nothing. */
const MontagesHeading = ({
  todo,
  over,
  dropTarget
}: {
  todo: string | null
  over: boolean
  dropTarget: Record<string, unknown>
}) => (
  <h2
    {...dropTarget}
    title={t`Drop a jump or files here to make a montage — its name is asked for first`}
    className={`mx-0 mt-[15px] mb-1.5 flex items-center gap-2 rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase max-[780px]:my-0 max-[780px]:flex-none ${
      over ? 'border-dashed border-pick bg-pick-soft' : 'border-transparent'
    }`}>
    <span className='flex-1'>{t`Montages`}</span>
    {todo && (
      <span className='flex-none rounded-full bg-local-soft px-1.5 text-[10.5px] font-semibold tracking-normal whitespace-nowrap text-local normal-case max-[780px]:hidden'>
        {todo}
      </span>
    )}
  </h2>
)

/* an entry of the rail that is no folder of files: what the storage holds, a camera plugged in */
const Entry = ({
  place,
  glyph,
  label,
  badge = null,
  title,
  count
}: {
  place: Place
  glyph: string
  label: string
  badge?: string | null
  title?: string
  count?: number
}) => (
  <PlaceLink
    place={place}
    title={title}
    className={(current) =>
      `block w-full rounded-md border px-2 pt-1.5 pb-[5px] text-left text-ink max-[780px]:w-auto max-[780px]:flex-none max-[780px]:rounded-full max-[780px]:border-line max-[780px]:bg-pane max-[780px]:px-[11px] max-[780px]:py-[5px] ${
        current ? 'border-line bg-pane shadow-card' : 'border-transparent hover:bg-line-2'
      }`
    }>
    {(current) => (
      <span className='flex items-center gap-2'>
        <span
          aria-hidden='true'
          className={`w-3.5 flex-none text-center ${current ? 'text-accent' : 'text-ink-3'}`}>
          {glyph}
        </span>
        <span className={`min-w-0 flex-1 truncate ${current ? 'font-semibold' : ''}`}>{label}</span>
        {badge && (
          <span className='flex-none rounded-full bg-local-soft px-1.5 text-[10.5px] font-semibold whitespace-nowrap text-local max-[780px]:hidden'>
            {badge}
          </span>
        )}
        {count !== undefined && (
          <span className='font-mono text-[11px] text-ink-3 tabular-nums'>{count}</span>
        )}
      </span>
    )}
  </PlaceLink>
)

/* a count of what is owed, or nothing when there is none */
const counted = (n: number, said: (n: number) => string) => (n > 0 ? said(n) : null)

const PlacesTree = ({
  destinations,
  groups,
  looseFiles,
  storage,
  cameras,
  statusContext,
  montageOpen,
  passengerProgress,
  onAddPlace,
  dropTarget,
  overTarget,
  flashPlace
}: Props) => {
  const [adding, setAdding] = useState('')
  const files = (p: Place) => hereIn(p, groups, looseFiles)
  /* still to file: every jump in the sorting area, and its loose files as one more thing to do */
  const toFile = (p: Place) =>
    counted(
      groupsIn(p, groups).length + (looseIn(p, looseFiles).length > 0 ? 1 : 0),
      (count) => t`${count} to file`
    )
  const toDo = (p: Place) =>
    counted(
      files(p).filter((f) => fileStatus(f, statusContext(f)) !== 'uploaded').length,
      (count) => t`${count} to do`
    )
  const openMontages = (p: Place) =>
    counted(
      groupsIn(p, groups).filter((g) => !g.freed && montageOpen(g)).length,
      (count) => t`${count} to do`
    )
  /* One entry per passenger, however many jumps they have: two jumps for the same person share one
     folder, so listing them twice would promise two folders that are really one. */
  const passengers = [
    ...new Set(
      groups
        .filter((g) => isMontage(g) && hasCompletePassenger(g.passenger))
        .map((g) => passengerOf(g))
    )
  ].sort((a, b) => a.localeCompare(b))
  const unnamed = groupsIn({ kind: 'unnamed' }, groups).length
  const node = (
    p: Place,
    glyph: string,
    todo: string | null,
    child?: boolean,
    progress?: MontageProgress | null
  ) => (
    <Node
      key={placeKey(p)}
      place={p}
      glyph={glyph}
      files={files(p)}
      todo={todo}
      child={child}
      statusContext={statusContext}
      dropTarget={dropTarget}
      over={overTarget === placeKey(p)}
      flash={flashPlace === placeKey(p)}
      progress={progress}
    />
  )
  const notEmailed = storage?.montages.filter((t) => !t.emailed).length ?? 0
  return (
    <nav
      aria-label={t`Folders`}
      className='sticky top-0 self-start overflow-y-auto border-line min-[781px]:flex min-[781px]:flex-col bg-rail px-2 pt-2.5 pb-6 max-[780px]:z-[8] max-[780px]:flex max-[780px]:h-auto max-[780px]:items-center max-[780px]:gap-1.5 max-[780px]:overflow-x-auto max-[780px]:overflow-y-hidden max-[780px]:border-b max-[780px]:px-3 max-[780px]:py-2 min-[781px]:h-full min-[781px]:border-r'>
      {/* what came off the cameras and is not filed yet: one entry, and the first thing on it */}
      {node({ kind: 'sort' }, '▤', toFile({ kind: 'sort' }))}
      <Heading>{t`Destinations`}</Heading>
      {destinations.map((d) =>
        node({ kind: 'dz', name: d.name }, '⌂', toDo({ kind: 'dz', name: d.name }))
      )}
      <span className='mx-2 mt-1 flex gap-1 max-[780px]:hidden'>
        <input
          type='text'
          value={adding}
          placeholder={t`New destination`}
          aria-label={t`New destination`}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            onAddPlace(adding)
            setAdding('')
          }}
          className='min-w-0 flex-1 rounded-md border border-line bg-pane px-2 py-0.5 text-[12px] placeholder:text-ink-3'
        />
        <button
          type='button'
          onClick={() => {
            onAddPlace(adding)
            setAdding('')
          }}
          className='rounded-[5px] border border-line bg-pane px-2 py-0.5 text-[11.5px] text-ink-2 hover:border-ink-3 hover:text-ink'>
          {t`Add`}
        </button>
      </span>
      <MontagesHeading
        todo={openMontages({ kind: 'montages' })}
        over={overTarget === placeKey({ kind: 'montages' })}
        dropTarget={dropTarget({ kind: 'montages' })}
      />
      {unnamed > 0 &&
        node(
          { kind: 'unnamed' },
          '?',
          counted(unnamed, (count) => t`${count} to name`),
          true
        )}
      {/* each passenger says the step they are at, so the list reads as a to-do list */}
      {passengers.map((name) => {
        const progress = passengerProgress(name)
        return node({ kind: 'pax', name }, '·', progress?.next?.todo ?? null, true, progress)
      })}
      {storage && (
        <>
          <Heading>{t`Storage`}</Heading>
          <Entry
            place={{ kind: 'storage' }}
            glyph='☁'
            label={t`On the storage`}
            badge={notEmailed > 0 ? t`${notEmailed} to email` : null}
            count={storage.montages.length}
          />
        </>
      )}
      {/* what was put aside, to be looked through and brought back from — never emptied from here */}
      <Heading>{t`Bin`}</Heading>
      <Entry
        place={{ kind: 'bin' }}
        glyph='🗑'
        label={t`Bin`}
        title={t`What was put aside — look through it, and bring files back to Fresh files`}
      />
      {/* a camera is listed for as long as it is plugged in, and goes with it — at the foot of the
          rail, apart from the folders of work */}
      {cameras.length > 0 && (
        <div className='min-[781px]:mt-auto min-[781px]:pt-4'>
          <Heading>{t`Camera`}</Heading>
          {cameras.map((c) => {
            const camera = c.camera
            return (
              <Entry
                key={c.mount}
                place={{ kind: 'camera', name: c.mount }}
                glyph='📷'
                label={c.camera}
                /* a camera with no drive to offer is read a request at a time, which is the whole of
                 why it is slower than the same card in a reader */
                badge={c.over === 'mtp' ? 'MTP' : null}
                title={
                  c.over === 'mtp'
                    ? t`${camera} hands its files over rather than showing them as a drive, so reading it is slower than the same card in a reader.`
                    : camera
                }
              />
            )
          })}
        </div>
      )}
    </nav>
  )
}

export { PlacesTree }
