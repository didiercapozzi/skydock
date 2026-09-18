import { TANDEMS } from '../helpers/jumps'
import type { Destination } from './types'

/* Where something goes, picked from a list rather than dragged: the sorting area, a dropzone, a
   passenger — whose tandem it joins — or a new tandem, named next. One choice files it; there is
   nothing to confirm. The value is the folder it is in now, so the list also says where that is. */
type Target =
  | { kind: 'unsorted' }
  | { kind: 'dz'; name: string }
  | { kind: 'pax'; name: string }
  | { kind: 'new' }

const valueOf = (target: Target) =>
  target.kind === 'dz' || target.kind === 'pax' ? `${target.kind}:${target.name}` : target.kind

const targetOf = (value: string): Target =>
  value.startsWith('dz:')
    ? { kind: 'dz', name: value.slice(3) }
    : value.startsWith('pax:')
      ? { kind: 'pax', name: value.slice(4) }
      : value === 'new'
        ? { kind: 'new' }
        : { kind: 'unsorted' }

const PlaceSelect = ({
  label,
  current,
  places,
  passengers,
  disabled,
  onPick
}: {
  label: string
  /* where it is now; a tandem still without a name is nowhere the list can name */
  current: Target | null
  places: Destination[]
  /* the passengers a jump can still join — one with an edit takes no one */
  passengers: string[]
  disabled?: boolean
  onPick: (target: Target) => void
}) => (
  <select
    aria-label={label}
    title={label}
    disabled={disabled}
    value={current ? valueOf(current) : ''}
    onClick={(e) => e.stopPropagation()}
    onChange={(e) => onPick(targetOf(e.target.value))}
    className='max-w-[190px] rounded-md border border-line bg-pane px-1.5 py-[3px] text-[12px] text-ink-2 disabled:opacity-45'>
    {!current && (
      <option
        value=''
        disabled>
        Choose…
      </option>
    )}
    <option value='unsorted'>Unsorted</option>
    <optgroup label='Dropzones'>
      {places
        .filter((d) => d.name !== TANDEMS)
        .map((d) => (
          <option
            key={d.name}
            value={`dz:${d.name}`}>
            {d.name}
          </option>
        ))}
    </optgroup>
    <optgroup label='Tandems'>
      {passengers.map((name) => (
        <option
          key={name}
          value={`pax:${name}`}>
          {name}
        </option>
      ))}
      <option value='new'>New tandem…</option>
    </optgroup>
  </select>
)

export { PlaceSelect }
export type { Target }
