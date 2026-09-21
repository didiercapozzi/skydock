import { NavLink } from 'react-router'
import { placeHref } from '../helpers/places'
import type { Place } from '../helpers/places'
import { useSafeSearchParams } from '../helpers/routing'
import { boardViewSchema } from '../helpers/view'

/* A folder in the rail, as a link to its own address.

   Choosing a folder is a navigation and not a change of mind kept in the board's memory: the back
   button walks the folders you looked at, a folder can be reloaded or sent to somebody, and the one
   being looked at is simply the one the address names. Which is what `isActive` answers, so nothing
   here compares one folder with another.

   A folder is also somewhere files are dropped, so everything the rail needs to catch a drop —
   and to say it is being dragged over — is passed straight through to the link.

   What travels with the link is the one choice that is the whole board's rather than a folder's:
   whether videos, photos or both are shown, which holds wherever you go next (RULES, The board).
   What was typed in the search box, and whichever jump card was open, are that folder's own and
   stay behind with it. */
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
