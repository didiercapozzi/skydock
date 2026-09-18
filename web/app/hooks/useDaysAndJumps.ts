import { useState } from 'react'
import type { Place } from '../components/places-tree'
import { placeKey } from '../components/places-tree'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { dayOf, dayOfFile } from '../helpers/jumps'

/* Which days are open, and which jumps are folded. Days open and close on their own — opening one
   leaves the others as they are — and which are open is remembered for the place you are in.
   Folding jumps is a standing choice, not something remembered per jump: collapse them once and
   every day opened afterwards opens folded too. `foldJumps` is that choice and `unfolded` holds the
   jumps told to differ from it, so one jump opened by hand does not undo the rest. Folded to start
   with: a day opens as its list of jumps, and the one wanted is opened from there. */
const useDaysAndJumps = ({
  place,
  groups,
  shownGroups,
  shownLoose,
  hasWorkLeft
}: {
  place: Place
  groups: ManifestGroup[]
  shownGroups: ManifestGroup[]
  shownLoose: ManifestFile[]
  hasWorkLeft: (file: ManifestFile) => boolean
}) => {
  const [openDays, setOpenDays] = useState<Record<string, string[]>>({})
  const [foldJumps, setFoldJumps] = useState(true)
  const [unfolded, setUnfolded] = useState<string[]>([])

  const key = placeKey(place)
  const setOpen = (days: string[]) => setOpenDays({ ...openDays, [key]: days })

  const days = [...new Set([...shownGroups.map(dayOf), ...shownLoose.map(dayOfFile)])]
    .sort()
    .reverse()
  /* the newest day with work left is the one worth opening; a place with nothing to do opens closed */
  const defaultDay = days.find((d) =>
    [
      ...shownGroups.filter((g) => dayOf(g) === d).flatMap((g) => g.files),
      ...shownLoose.filter((f) => dayOfFile(f) === d)
    ].some(hasWorkLeft)
  )
  /* until something is opened or closed here, the newest day with work left in it is open */
  const firstDay = defaultDay ?? days[0]
  const shownDays = openDays[key] ?? (firstDay ? [firstDay] : [])
  const toggleDay = (day: string) =>
    setOpen(shownDays.includes(day) ? shownDays.filter((d) => d !== day) : [...shownDays, day])

  /* A jump chip is asking for that one jump: its day opens, and it is the only jump left unfolded,
     so what the chip was pressed for is what is on screen. Opening and folding anywhere else leaves
     the others alone; the chip is the one place that picks. The scroll waits two frames because the
     jump it is scrolling to does not exist until the day it is in has been drawn. */
  const openAt = (day: string, anchor: string) => {
    if (!shownDays.includes(day)) setOpen([...shownDays, day])
    if (groups.some((g) => g.id === anchor)) {
      setFoldJumps(true)
      setUnfolded([anchor])
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById(`at-${anchor}`)?.scrollIntoView({ block: 'start' })
      )
    )
  }

  const jumpShut = (groupId: string) => foldJumps !== unfolded.includes(groupId)
  /* the jumps of the days that are open — what tells Collapse and Expand whether there is
     anything left for them to do */
  const openDayJumps =
    place.kind === 'sort'
      ? shownGroups.filter((g) => shownDays.includes(dayOf(g))).map((g) => g.id)
      : []
  const foldAll = (fold: boolean) => {
    setFoldJumps(fold)
    setUnfolded([])
  }
  /* each jump opens and folds on its own; the others stay as they are */
  const toggleJump = (groupId: string) =>
    setUnfolded(
      unfolded.includes(groupId) ? unfolded.filter((x) => x !== groupId) : [...unfolded, groupId]
    )

  return {
    days,
    shownDays,
    closeAll: () => setOpen([]),
    toggleDay,
    openAt,
    jumpShut,
    openDayJumps,
    foldAll,
    toggleJump
  }
}

export { useDaysAndJumps }
