import { fileStatus, hasCompletePassenger, isMontage, passengerOf } from '@skydock/scripts'
import type { StatusContext, MontageEntry, MontageProgress } from '@skydock/scripts'
import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { groupsIn, hereIn, looseIn, placeKey, placeLabel } from '../helpers/places'
import type { Place } from '../helpers/places'
import type { Mounted } from '../hooks/useLiveProgress'
import { Mini } from './buttons'
import { Icon } from './icons'
import type { IconName } from './icons'
import { PlaceLink } from './place-link'
import { StepMeter } from './montage-steps'
import type { Destination, ManifestFile, ManifestGroup } from './types'

/* The folders, down the left like any file manager's, in four runs: the work still to sort, the
   destinations, the montages, and what lies elsewhere — the storage, a camera plugged in, the bin.
   Each says how many files it holds and, under that, what it still owes, in the colour of work left:
   a destination with a thin bar of how much is local, processed or uploaded, a montage with the
   steps it has taken — so the state of the whole club is read without opening anything. Pinned: only
   the files scroll, so any folder can take a drop. On a phone it becomes one strip of folders across
   the top. */
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

/* One row of the rail: its mark, its name and how many files it holds, and under that what it still
   owes — with, where it says more than a number, how far its files have got. The folder being looked
   at is filled in blue; one something is dragged over is ringed, to say it will take the drop. */
/* each kind of place in a colour of its own, so the rail is read by colour before it is read by word */
const TINT: Partial<Record<IconName, string>> = {
  fresh: 'text-accent',
  place: 'text-teal',
  montage: 'text-proc',
  storage: 'text-up',
  camera: 'text-local',
  bin: 'text-bin'
}

const Row = ({
  place,
  icon,
  label = placeLabel(place),
  count,
  owed = null,
  below = null,
  title,
  dropTarget = {},
  over = false,
  flash = false,
  quiet = false
}: {
  place: Place
  icon: IconName
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
}) => (
  <PlaceLink
    place={place}
    title={title}
    {...dropTarget}
    className={(current) =>
      `block w-full rounded-[5px] border px-2 py-1 text-left text-ink max-[780px]:w-auto max-[780px]:flex-none max-[780px]:rounded-full max-[780px]:border-line max-[780px]:px-[11px] ${
        over
          ? 'border-dashed border-pick bg-pick-soft'
          : current
            ? 'border-accent bg-accent text-white'
            : 'border-transparent hover:bg-line-2 max-[780px]:bg-pane'
      } ${flash ? 'animate-[placeflash_1.8s_ease-out]' : ''}`
    }>
    {(current) => {
      const lit = current && !over
      const second = below?.(lit)
      return (
        <>
          <span className='flex items-center gap-2'>
            <Icon
              name={icon}
              size={15}
              className={lit ? 'text-white' : TINT[icon]}
            />
            <span
              className={`min-w-0 flex-1 truncate text-[13px] font-medium ${quiet ? 'italic' : ''} ${
                lit ? 'text-white' : quiet ? 'text-ink-3' : ''
              }`}
              title={label}>
              {label}
            </span>
            {count !== undefined && (
              <span className={`text-[11.5px] tabular-nums ${lit ? 'text-white' : 'text-ink-3'}`}>
                {count}
              </span>
            )}
          </span>
          {(owed || second) && (
            <span
              className={`mt-0.5 ml-[23px] flex items-center gap-2 text-[11.5px] max-[780px]:hidden ${
                lit ? 'text-white' : 'text-ink-3'
              }`}>
              {second}
              {owed && (
                <span
                  className={`whitespace-nowrap font-medium ${lit ? 'text-white opacity-90' : 'text-local'} ${second ? '' : 'mr-auto'}`}>
                  {owed}
                </span>
              )}
            </span>
          )}
        </>
      )
    }}
  </PlaceLink>
)

/* how much of a folder is local, processed or uploaded, as one thin bar */
const Split = ({
  files,
  statusContext
}: {
  files: ManifestFile[]
  statusContext: (file: ManifestFile) => StatusContext
}) => {
  const counts = { local: 0, processed: 0, uploaded: 0 }
  for (const file of files) counts[fileStatus(file, statusContext(file))] += 1
  const width = (n: number) => `${(n / (files.length || 1)) * 100}%`
  return (
    <span className='flex h-[3px] flex-1 gap-px overflow-hidden rounded-sm bg-line'>
      <i
        className='block h-full bg-up'
        style={{ width: width(counts.uploaded) }}
      />
      <i
        className='block h-full bg-proc'
        style={{ width: width(counts.processed) }}
      />
      <i
        className='block h-full bg-local-bar'
        style={{ width: width(counts.local) }}
      />
    </span>
  )
}

const Heading = ({ children, first }: { children: string; first?: boolean }) => (
  <h2
    className={`mx-2 mb-0.5 text-[10.5px] font-semibold tracking-[0.04em] text-ink-3 uppercase max-[780px]:my-0 max-[780px]:mr-0.5 max-[780px]:ml-1.5 max-[780px]:flex-none ${
      first ? 'mt-2' : 'mt-3'
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
    className={`mx-0 mt-2 mb-0.5 flex items-center gap-2 rounded-[5px] border px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.04em] text-ink-3 uppercase max-[780px]:my-0 max-[780px]:flex-none ${
      over ? 'border-dashed border-pick bg-pick-soft' : 'border-transparent'
    }`}>
    <span className='flex-1'>{t`Montages`}</span>
    {todo && (
      <span className='flex-none text-[11px] font-medium tracking-normal whitespace-nowrap text-local normal-case max-[780px]:hidden'>
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
        className='flex w-full items-center gap-2 rounded-[5px] px-2 py-[5px] text-left text-[12.5px] text-ink-3 hover:bg-line-2 hover:text-ink-2 max-[780px]:hidden'>
        <Icon
          name='plus'
          size={15}
        />
        {t`Add a destination…`}
      </button>
    )
  return (
    <span className='mx-2 my-1 flex gap-1 max-[780px]:hidden'>
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
        className='h-7 min-w-0 flex-1 rounded-[5px] border border-line-strong bg-pane px-2 text-[12.5px] outline-none placeholder:text-ink-3 focus:border-accent'
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
  const notEmailed = storage?.montages.filter((t) => !t.emailed).length ?? 0
  return (
    <nav
      aria-label={t`Folders`}
      className='sticky top-0 self-start overflow-y-auto border-line backdrop-rail bg-rail px-2 pt-1 pb-6 max-[780px]:z-[8] max-[780px]:flex max-[780px]:h-auto max-[780px]:items-center max-[780px]:gap-1.5 max-[780px]:overflow-x-auto max-[780px]:overflow-y-hidden max-[780px]:border-b max-[780px]:px-3 max-[780px]:py-2 min-[781px]:flex min-[781px]:h-full min-[781px]:flex-col min-[781px]:border-r'>
      {/* what came off the cameras and is not filed yet: one entry, and the first thing on it */}
      <Heading first>{t`Work`}</Heading>
      <Row
        {...folder({ kind: 'sort' })}
        icon='fresh'
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
            icon='place'
            owed={toDo(p)}
            below={
              held.length > 0
                ? () => (
                    <>
                      <Split
                        files={held}
                        statusContext={statusContext}
                      />
                      {!toDo(p) && <span className='whitespace-nowrap'>{t`all up`}</span>}
                    </>
                  )
                : null
            }
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
            icon='montage'
            below={
              progress
                ? (lit) => (
                    <>
                      {todo && <span className='mr-auto whitespace-nowrap'>{todo}</span>}
                      <StepMeter
                        progress={progress}
                        className={
                          /* on the blue of the folder being looked at, the step it is at is white */
                          lit
                            ? 'ml-auto [&>i.bg-accent]:bg-white [&>i.bg-line-2]:bg-white/30'
                            : 'ml-auto'
                        }
                      />
                    </>
                  )
                : null
            }
          />
        )
      })}
      {unnamed > 0 && (
        <Row
          {...folder({ kind: 'unnamed' })}
          icon='montage'
          quiet
          owed={counted(unnamed, (count) => t`${count} to name`)}
        />
      )}
      <Heading>{t`Elsewhere`}</Heading>
      {storage && (
        <Row
          place={{ kind: 'storage' }}
          icon='storage'
          count={storage.montages.length}
          owed={notEmailed > 0 ? t`${notEmailed} to email` : null}
        />
      )}
      {/* a camera is listed for as long as it is plugged in, and goes with it */}
      {cameras.map((c) => {
        const camera = c.camera
        return (
          <Row
            key={c.mount}
            place={{ kind: 'camera', name: c.mount }}
            icon='camera'
            label={c.camera}
            /* a camera with no drive to offer is read a request at a time, which is the whole of
               why it is slower than the same card in a reader */
            owed={c.over === 'mtp' ? 'MTP' : null}
            title={
              c.over === 'mtp'
                ? t`${camera} hands its files over rather than showing them as a drive, so reading it is slower than the same card in a reader.`
                : camera
            }
          />
        )
      })}
      {/* what was put aside, to be looked through and brought back from — never emptied from here */}
      <Row
        place={{ kind: 'bin' }}
        icon='bin'
        title={t`What was put aside — look through it, and bring files back to Fresh files`}
      />
    </nav>
  )
}

export { PlacesTree }
