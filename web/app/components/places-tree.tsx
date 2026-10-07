import { fileStatus, hasCompletePassenger, isMontage, passengerOf } from '@skydock/scripts'
import type { StatusContext, MontageProgress } from '@skydock/scripts'
import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { groupsIn, hereIn, looseIn, placeKey, placeLabel } from '../helpers/places'
import type { Place } from '../helpers/places'
import type { KnownCamera, Mounted } from '../hooks/useLiveProgress'
import { Mini } from './buttons'
import { Icon, Mark } from './icons'
import type { IconName } from './icons'
import { PlaceLink } from './place-link'
import { StepMeter } from './montage-steps'
import type { Destination, ManifestFile, ManifestGroup } from './types'

/* The folders, down the left like any file manager's, in four runs: the work still to sort, the
   destinations, the montages, and what lies elsewhere — a camera plugged in, the bin.
   Each says how many files it holds and, under that, what it still owes, in the colour of work left:
   a destination with a thin bar of how much is local, processed or uploaded, a montage with the
   steps it has taken — so the state of the whole club is read without opening anything. Pinned: only
   the files scroll, so any folder can take a drop. On a phone it becomes one strip of folders across
   the top. */
type Props = {
  destinations: Destination[]
  groups: ManifestGroup[]
  looseFiles: ManifestFile[]
  /* the cameras plugged in right now */
  cameras: Mounted[]
  /* every camera this machine has met, plugged in or not */
  knownCameras: KnownCamera[]
  statusContext: (file: ManifestFile) => StatusContext
  /* whether a montage still has a step to take here */
  montageOpen: (group: ManifestGroup) => boolean
  /* how many montages are finished — emailed and freed, so only the storage holds them */
  delivered: number
  /* where a passenger has got to — their jump furthest behind */
  passengerProgress: (name: string) => MontageProgress | null
  onAddPlace: (name: string) => void
  dropTarget: (place: Place) => Record<string, unknown>
  overTarget: string | null
  /* the folder something was just filed under, lit for a moment so the eye can follow it there */
  flashPlace?: string | null
}

/* the mark a folder wears in its tile */
const iconOf = (place: Place): IconName =>
  place.kind === 'sort'
    ? 'fresh'
    : place.kind === 'dz'
      ? 'place'
      : place.kind === 'camera'
        ? 'camera'
        : place.kind === 'delivered'
          ? 'check'
          : place.kind === 'bin'
            ? 'bin'
            : 'montage'

/* One row of the rail: its mark, its name and how many files it holds, and under that what it still
   owes — with, where it says more than a number, how far its files have got. The folder being looked
   at is filled in blue; one something is dragged over is ringed, to say it will take the drop. */

const Row = ({
  place,
  label = placeLabel(place),
  count,
  owed = null,
  below = null,
  title,
  dropTarget = {},
  over = false,
  flash = false,
  quiet = false,
  tone = 'solid',
  dot
}: {
  place: Place
  label?: string
  count?: number
  /* what is still owed there, in words: "3 to file", "7 to do" — in the colour of work left */
  owed?: string | null
  /* what else the second line carries: how far the files have got, or a plain word */
  below?: ((current: boolean) => React.ReactNode) | null
  title?: string
  dropTarget?: Record<string, unknown>
  over?: boolean
  flash?: boolean
  /* a folder standing for what has no name yet, set apart from the named ones */
  quiet?: boolean
  /* how the badge at the right reads: a solid pill for work waiting, a white one for "new", plain words otherwise */
  tone?: 'solid' | 'white' | 'quiet'
  /* a camera: plugged in, or remembered and not */
  dot?: 'on' | 'off'
}) => (
  <PlaceLink
    place={place}
    title={title}
    {...dropTarget}
    className={(current) =>
      `flex w-full items-center gap-2.5 rounded-corner px-2 py-1.5 text-left text-ink desk:min-h-control-lg max-desk:w-auto max-desk:flex-none max-desk:rounded-full max-desk:px-2.75 max-desk:shadow-soft ${
        over
          ? 'bg-pick-soft outline-1 -outline-offset-1 outline-pick outline-dashed'
          : current
            ? 'bg-pane shadow-soft'
            : 'hover:bg-pane/50 max-desk:bg-pane'
      } ${flash ? 'animate-[placeflash_1.8s_ease-out]' : ''}`
    }>
    {(current) => {
      const lit = current && !over
      const second = below?.(lit)
      return (
        <>
          {/* the folder's mark in a tile: pale on the sky, solid blue for the folder being looked at */}
          <span
            className={`grid size-control-sm flex-none place-items-center rounded-corner max-desk:hidden ${
              lit ? 'bg-accent text-on-accent shadow-glow' : 'bg-pane/70 text-accent'
            }`}>
            <Icon
              name={iconOf(place)}
              size={16}
            />
          </span>
          <span className='flex min-w-0 flex-1 flex-col'>
            <span className='flex items-center justify-between gap-2'>
              <span className='flex min-w-0 items-center gap-2.5'>
                {dot && (
                  <i
                    aria-hidden='true'
                    className={`size-2 flex-none rounded-full ${
                      dot === 'on' ? 'bg-up' : 'shadow-inset-ring'
                    }`}
                  />
                )}
                <span
                  className={`min-w-0 truncate text-title ${lit ? 'font-bold' : 'font-medium'} ${quiet ? 'italic' : ''} ${
                    quiet && !lit ? 'text-ink-3' : ''
                  }`}
                  title={label}>
                  {label}
                </span>
              </span>
              {(owed || (count ?? 0) > 0) && !second && (
                <span
                  className={`flex-none text-small whitespace-nowrap tabular-nums max-desk:hidden ${
                    tone === 'quiet'
                      ? 'font-medium text-ink-3'
                      : `rounded-full px-2 py-0.5 font-bold ${
                          tone === 'white' ? 'bg-pane text-accent-ink' : 'bg-accent text-on-accent'
                        }`
                  }`}>
                  {owed ?? count}
                </span>
              )}
            </span>
            {second && (
              <span className='mt-1.5 flex flex-col gap-1.5 text-micro font-medium text-ink-3 max-desk:hidden'>
                {second}
              </span>
            )}
          </span>
        </>
      )
    }}
  </PlaceLink>
)

const Heading = ({ children, first }: { children: string; first?: boolean }) => (
  <h2
    className={`mx-2.5 mb-1.25 text-micro font-bold tracking-eyebrow text-accent-ink/70 uppercase max-desk:my-0 max-desk:mr-0.5 max-desk:ml-1.5 max-desk:flex-none ${
      first ? 'mt-1' : 'mt-3.5'
    }`}>
    {children}
  </h2>
)

/* The Montages heading is where a jump is dropped to become a montage, and nothing more: there is no
   page of every montage, because a montage is worked on one at a time. So it takes a drop and lights
   up under one, and a click does nothing. */
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
    className={`mx-0 mt-3 mb-0.75 flex items-center gap-2 rounded-corner px-2.5 py-0.5 text-micro font-bold tracking-eyebrow text-accent-ink/70 uppercase max-desk:my-0 max-desk:flex-none ${
      over ? 'bg-pick-soft outline-1 -outline-offset-1 outline-pick outline-dashed' : ''
    }`}>
    <span className='flex-1'>{t`Montages`}</span>
    {todo && (
      <span className='flex-none tracking-normal whitespace-nowrap text-accent-ink normal-case max-desk:hidden'>
        {todo}
      </span>
    )}
  </h2>
)

/* Adding a destination is a quiet line until it is wanted: the field opens under the pointer, and
   closes again once the name is added or let go. */
const AddPlace = ({ onAdd }: { onAdd: (name: string) => void }) => {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState('')
  const add = () => {
    onAdd(adding)
    setAdding('')
    setOpen(false)
  }
  if (!open)
    return (
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-corner border-[1.5px] border-dashed border-white bg-white/25 text-lead font-semibold text-accent-ink hover:bg-white/45 max-desk:hidden dark:border-line-strong dark:bg-transparent dark:hover:bg-well'>
        <Icon
          name='plus'
          size={16}
        />
        {t`Add a destination…`}
      </button>
    )
  return (
    <span className='mx-2 my-1 flex gap-1 max-desk:hidden'>
      <input
        type='text'
        autoFocus
        value={adding}
        placeholder={t`New destination`}
        aria-label={t`New destination`}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add()
          if (e.key === 'Escape') setOpen(false)
        }}
        onBlur={() => {
          if (!adding.trim()) setOpen(false)
        }}
        className='h-8 min-w-0 flex-1 rounded-corner border border-line-strong bg-well px-2.5 text-body outline-none placeholder:text-ink-3 focus:border-accent'
      />
      <Mini onClick={add}>{t`Add`}</Mini>
    </span>
  )
}

/* a count of what is owed, or nothing when there is none */
const counted = (n: number, said: (n: number) => string) => (n > 0 ? said(n) : null)

const PlacesTree = ({
  destinations,
  groups,
  looseFiles,
  cameras,
  knownCameras,
  statusContext,
  montageOpen,
  delivered,
  passengerProgress,
  onAddPlace,
  dropTarget,
  overTarget,
  flashPlace
}: Props) => {
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
  /* One entry per montage, however many jumps it has: two jumps for the same person share one
     folder, so listing them twice would promise two folders that are really one. */
  const passengers = [
    ...new Set(
      groups
        .filter((g) => isMontage(g) && hasCompletePassenger(g.passenger))
        .map((g) => passengerOf(g))
    )
  ].sort((a, b) => a.localeCompare(b))
  const unnamed = groupsIn({ kind: 'unnamed' }, groups).length
  /* a folder of files: it takes a drop, and lights up for a moment when something was filed there */
  const folder = (p: Place) => ({
    place: p,
    count: files(p).length,
    dropTarget: dropTarget(p),
    over: overTarget === placeKey(p),
    flash: flashPlace === placeKey(p)
  })
  return (
    <nav
      aria-label={t`Folders`}
      className='sticky top-0 gap-px self-start overflow-y-auto isle-rail z-8 rounded-corner desk:rounded-r-none desk:rounded-b-none px-2.5 pb-3.5 desk:border-r desk:border-divider max-desk:pt-2 max-desk:flex max-desk:h-auto max-desk:items-center max-desk:gap-1.5 max-desk:overflow-x-auto max-desk:overflow-y-hidden max-desk:px-3 max-desk:pb-2 desk:col-start-1 desk:row-span-2 desk:row-start-1 desk:flex desk:h-full desk:flex-col'>
      {/* the app's name, level with the header across from it */}
      <div className='flex h-14 flex-none items-center gap-2.5 px-2 max-desk:hidden'>
        <Mark size={32} />
        <span className='text-subhead font-extrabold text-ink'>SkyDock</span>
      </div>
      {/* what came off the cameras and is not filed yet: one entry, and the first thing on it */}
      <Heading first>{t`Work`}</Heading>
      <Row
        {...folder({ kind: 'sort' })}
        owed={toFile({ kind: 'sort' })}
      />
      <Heading>{t`Destinations`}</Heading>
      {destinations.map((d) => {
        const p: Place = { kind: 'dz', name: d.name }
        const held = files(p)
        return (
          <Row
            key={placeKey(p)}
            {...folder(p)}
            owed={toDo(p) ?? (held.length > 0 ? t`all up` : undefined)}
            tone={toDo(p) ? 'solid' : 'white'}
          />
        )
      })}
      <AddPlace onAdd={onAddPlace} />
      <MontagesHeading
        todo={openMontages({ kind: 'montages' })}
        over={overTarget === placeKey({ kind: 'montages' })}
        dropTarget={dropTarget({ kind: 'montages' })}
      />
      {/* each montage says the step it is at, so the list reads as a to-do list */}
      {passengers.map((name) => {
        const p: Place = { kind: 'pax', name }
        const progress = passengerProgress(name)
        const todo = progress?.next?.todo
        return (
          <Row
            key={placeKey(p)}
            {...folder(p)}
            below={
              progress
                ? (lit) => (
                    <>
                      <StepMeter
                        progress={progress}
                        className={
                          /* on the tint of the folder being looked at, the steps still to take need a line that shows */
                          lit ? 'flex-1 [&>i.bg-line]:bg-accent/20' : 'flex-1'
                        }
                      />
                      {todo && <span className='whitespace-nowrap'>{todo}</span>}
                    </>
                  )
                : null
            }
          />
        )
      })}
      {passengers.length === 0 && unnamed === 0 && delivered > 0 && (
        <span className='px-2.5 py-1 text-body text-ink-3 max-desk:hidden'>
          {t`Nothing left to do`}
        </span>
      )}
      {unnamed > 0 && (
        <Row
          {...folder({ kind: 'unnamed' })}
          quiet
          owed={counted(unnamed, (count) => t`${count} to name`)}
        />
      )}
      <Heading>{t`Elsewhere`}</Heading>
      {/* a camera is listed for as long as this machine knows it — plugged in, or not */}
      {knownCameras.map((k) => {
        const here = cameras.find((c) => c.key === k.key)
        const name = k.name
        return (
          <Row
            key={k.key}
            place={{ kind: 'camera', name: k.key }}
            label={k.name}
            dot={here ? 'on' : 'off'}
            tone={here && !k.auto && here.fresh ? 'white' : 'quiet'}
            quiet={!here}
            /* what is new on it, or that it is not here; a camera with no drive to offer is read a
               request at a time, which is the whole of why it is slower than the same card in a reader */
            owed={
              !here
                ? t`not connected`
                : !k.auto && here.fresh
                  ? t`${here.fresh} new`
                  : here.over === 'mtp'
                    ? 'MTP'
                    : null
            }
            title={
              !here
                ? t`${name} is not connected — it is remembered, and checked for new files when it is plugged in.`
                : here.over === 'mtp'
                  ? t`${name} hands its files over rather than showing them as a drive, so reading it is slower than the same card in a reader.`
                  : name
            }
          />
        )
      })}
      {delivered > 0 && (
        <Row
          place={{ kind: 'delivered' }}
          count={delivered}
          title={t`Montages that are done: emailed, and freed from this machine — only the storage holds them`}
        />
      )}
      {/* what was put aside, to be looked through and brought back from — never emptied from here */}
      <Row
        place={{ kind: 'bin' }}
        title={t`What was put aside — look through it, and bring files back to Fresh files`}
      />
    </nav>
  )
}

export { PlacesTree }
