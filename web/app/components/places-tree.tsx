import { fileStatus, passengerName, passengerOf } from '@skydock/scripts'
import { useState } from 'react'
import type { StatusContext } from '@skydock/scripts'
import type { Destination, ManifestFile, ManifestGroup } from './types'

/* Where a file can be: the sorting area, a dropzone, or a passenger. One place is selected at a
   time and its files fill the pane beside this. The menu never shows files itself — that is what
   lets the whole day's shape stay on screen at once. */
type Place =
  | { kind: 'sort' }
  | { kind: 'dz'; name: string }
  | { kind: 'tandems' }
  | { kind: 'pax'; name: string }

type Props = {
  place: Place
  destinations: Destination[]
  groups: ManifestGroup[]
  looseFiles: ManifestFile[]
  statusContext: (file: ManifestFile) => StatusContext
  unnamedTandems: number
  onPick: (place: Place) => void
  onAddPlace: (name: string) => void
  dropTarget: (place: Place) => Record<string, unknown>
  overTarget: string | null
  /* the place something was just filed under, lit for a moment so the eye can follow it there */
  flashPlace?: string | null
}

const TANDEMS = 'Tandems'

const placeKey = (place: Place) => `${place.kind}:${'name' in place ? place.name : ''}`
const samePlace = (a: Place, b: Place) => placeKey(a) === placeKey(b)

/* what a place is called, wherever it is named — the menu entry and the heading above the files are
   the same words by construction, not by being typed out twice */
const placeLabel = (place: Place) =>
  place.kind === 'sort'
    ? 'Unsorted jumps'
    : place.kind === 'tandems'
      ? 'All passengers'
      : place.name

/* a passenger's name as it is shown, and as two jumps are recognised as the same person by */
const Node = ({
  place,
  label,
  glyph,
  files,
  child,
  current,
  statusContext,
  onPick,
  dropTarget,
  over,
  flash
}: {
  place: Place
  label: string
  glyph: string
  files: ManifestFile[]
  child?: boolean
  current: boolean
  statusContext: (file: ManifestFile) => StatusContext
  onPick: (place: Place) => void
  dropTarget: (place: Place) => Record<string, unknown>
  over: boolean
  flash?: boolean
}) => {
  /* how much is still owed, at a glance: counts alone never answer "what is left" */
  const counts = { local: 0, processed: 0, uploaded: 0 }
  for (const file of files) counts[fileStatus(file, statusContext(file))] += 1
  const total = files.length || 1
  const width = (n: number) => `${(n / total) * 100}%`
  return (
    <button
      type='button'
      aria-current={current}
      {...dropTarget(place)}
      onClick={() => onPick(place)}
      className={`block w-full rounded-md border px-2 pt-1.5 pb-[5px] text-left text-ink max-[780px]:w-auto max-[780px]:flex-none max-[780px]:rounded-full max-[780px]:border-line max-[780px]:bg-pane max-[780px]:px-[11px] max-[780px]:py-[5px] ${
        over
          ? 'border-dashed border-pick bg-pick-soft'
          : current
            ? 'border-line bg-pane shadow-card'
            : 'border-transparent hover:bg-line-2'
      } ${child ? 'pl-[22px] max-[780px]:pl-[11px]' : ''} ${flash ? 'animate-[placeflash_1.8s_ease-out]' : ''}`}>
      <span className='flex items-center gap-2 max-[780px]:gap-1.5'>
        <span
          aria-hidden='true'
          className={`w-3.5 flex-none ${current ? 'text-accent' : 'text-ink-3'}`}>
          {glyph}
        </span>
        <span
          className={`min-w-0 flex-1 truncate ${current ? 'font-semibold' : ''}`}
          title={label}>
          {label}
        </span>
        <span className='font-mono text-[11px] text-ink-3 tabular-nums'>{files.length}</span>
      </span>
      {files.length > 0 && (
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
      )}
    </button>
  )
}

const Heading = ({ children }: { children: string }) => (
  <h2 className='mx-2 mt-[15px] mb-1.5 text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase first:mt-[3px] max-[780px]:my-0 max-[780px]:mr-0.5 max-[780px]:ml-1.5 max-[780px]:flex-none max-[780px]:first:ml-0'>
    {children}
  </h2>
)

/* Pinned: only the file pane scrolls, so the menu never scrolls away. On a phone it becomes one
   strip of place chips across the top rather than a column eating half the screen. */
const PlacesTree = ({
  place,
  destinations,
  groups,
  looseFiles,
  statusContext,
  unnamedTandems,
  onPick,
  onAddPlace,
  dropTarget,
  overTarget,
  flashPlace
}: Props) => {
  const [adding, setAdding] = useState('')
  const filesOf = (list: ManifestGroup[]) => list.flatMap((g) => g.files)
  const unsorted = [
    ...filesOf(groups.filter((g) => !g.destination)),
    ...looseFiles.filter((f) => !f.destination)
  ]
  /* One entry per passenger, however many jumps they have: two jumps for the same person share one
     folder, so listing them twice would promise two folders that are really one. */
  const byPassenger = new Map<string, ManifestFile[]>()
  for (const g of groups) {
    const who = passengerOf(g)
    if (g.destination !== TANDEMS || !who) continue
    byPassenger.set(who, [...(byPassenger.get(who) ?? []), ...g.files])
  }
  const named = [...byPassenger.entries()].sort(([a], [b]) => a.localeCompare(b))
  const node = (p: Place, glyph: string, files: ManifestFile[], child?: boolean) => (
    <Node
      key={placeKey(p)}
      place={p}
      label={placeLabel(p)}
      glyph={glyph}
      files={files}
      child={child}
      current={samePlace(place, p)}
      statusContext={statusContext}
      onPick={onPick}
      dropTarget={dropTarget}
      over={overTarget === placeKey(p)}
      flash={flashPlace === placeKey(p)}
    />
  )
  return (
    <nav
      aria-label='Places'
      className='sticky top-0 self-start overflow-y-auto border-line bg-rail px-2 pt-2.5 pb-6 max-[780px]:z-[8] max-[780px]:flex max-[780px]:h-auto max-[780px]:items-center max-[780px]:gap-1.5 max-[780px]:overflow-x-auto max-[780px]:overflow-y-hidden max-[780px]:border-b max-[780px]:px-3 max-[780px]:py-2 min-[781px]:h-full min-[781px]:border-r'>
      <Heading>To sort</Heading>
      {node({ kind: 'sort' }, '◇', unsorted)}
      <Heading>Dropzones</Heading>
      {destinations
        .filter((d) => d.name !== TANDEMS)
        .map((d) =>
          node({ kind: 'dz', name: d.name }, '▤', [
            ...filesOf(groups.filter((g) => g.destination === d.name)),
            ...looseFiles.filter((f) => f.destination === d.name)
          ])
        )}
      <span className='mx-2 mt-1 flex gap-1 max-[780px]:hidden'>
        <input
          type='text'
          value={adding}
          placeholder='New dropzone'
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
          Add
        </button>
      </span>
      <Heading>Tandems</Heading>
      {node({ kind: 'tandems' }, '▤', filesOf(groups.filter((g) => g.destination === TANDEMS)))}
      {named.map(([who, files]) => node({ kind: 'pax', name: who }, '◔', files, true))}
      {unnamedTandems > 0 && (
        <div className='mt-1 ml-[22px] text-[10.5px] font-semibold text-local max-[780px]:hidden'>
          {unnamedTandems} waiting for a name
        </div>
      )}
    </nav>
  )
}

export { PlacesTree, passengerName, placeKey, placeLabel, samePlace, passengerOf }
export type { Place }
