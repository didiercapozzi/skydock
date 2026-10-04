import { NavLink } from 'react-router'
import { placeHref } from '../helpers/places'
import type { Place } from '../helpers/places'
import { useSafeSearchParams } from '../helpers/routing'
import { boardViewSchema } from '../helpers/view'

const PlaceLink = ({
  place,
  className,
  children,
  ...rest
}: {
  place: Place
  className: (active: boolean) => string
  children: (active: boolean) => React.ReactNode
} & Record<string, unknown>) => {
  const { searchParams: looking } = useSafeSearchParams(boardViewSchema)
  return (
    <NavLink
      to={placeHref(place, { kind: looking.kind })}
      className={({ isActive }) => className(isActive)}
      {...rest}>
      {({ isActive }) => children(isActive)}
    </NavLink>
  )
}

export { PlaceLink }
