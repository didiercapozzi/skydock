import { t } from '@lingui/core/macro'
import type { Place } from '../helpers/places'
import { Menu, MenuItem } from './settings-menu'

const MoveTo = ({
  here,
  destinations,
  montages,
  onMove
}: {
  here: Place | null
  destinations: string[]
  montages: string[]
  onMove: (to: Place) => void
}) => {
  const isHere = (to: Place) =>
    here !== null &&
    here.kind === to.kind &&
    ('name' in here ? here.name : '') === ('name' in to ? to.name : '')
  const choices: [Place, string][] = [
    [{ kind: 'sort' }, t`Fresh files`],
    ...destinations.map((name): [Place, string] => [{ kind: 'dz', name }, name]),
    ...montages.map((name): [Place, string] => [{ kind: 'pax', name }, t`${name}’s montage`]),
    [{ kind: 'montages' }, t`A new montage…`]
  ]
  return (
    <Menu
      label={t`Move to…`}
      lead='moveTo'
      side='left'>
      {(close) => (
        <span className='flex flex-col'>
          {choices
            .filter(([to]) => !isHere(to))
            .map(([to, name]) => (
              <MenuItem
                key={`${to.kind}:${'name' in to ? to.name : ''}`}
                onClick={() => {
                  close()
                  onMove(to)
                }}>
                {name}
              </MenuItem>
            ))}
        </span>
      )}
    </Menu>
  )
}

export { MoveTo }
