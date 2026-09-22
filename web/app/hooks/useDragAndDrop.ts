import { passengerName, passengerOf } from '@skydock/scripts'
import { useState } from 'react'
import type { Passenger } from '../components/tandem-card'
import type { Dropped } from '../helpers/import'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { droppedIn, fromComputer } from '../helpers/import'
import { TANDEMS, inTandemsCard } from '../helpers/jumps'
import { placeKey } from '../helpers/places'
import type { Place } from '../helpers/places'

type Move = {
  destination?: string | null
  targetGroupId?: string
  newGroup?: boolean
  /* for a new jump: what it is called and when it started */
  name?: string
  startsAt?: number
  /* into the jump as a copy: the files stay where they are as well */
  copy?: boolean
}

/* Alt or ctrl held while dropping copies instead of moving, as it does in a file manager — and the
   pointer says so while it is held, with the plus a copy is always shown by. */
const copying = (e: React.DragEvent) => e.altKey || e.ctrlKey
const showIntent = (e: React.DragEvent) => {
  e.dataTransfer.dropEffect = copying(e) ? 'copy' : 'move'
}

/* What is in the air and where it may land. A whole jump travels by its line; files travel by their
   thumbnails, the picked ones together; and files from the computer travel as "Files". Only the zone
   under the pointer lights up, and only when it takes what is being carried. */
const useDragAndDrop = ({
  groups,
  frozen,
  pickedFiles,
  moveFiles,
  assign,
  importDropped
}: {
  groups: ManifestGroup[]
  frozen: Set<string>
  pickedFiles: string[]
  moveFiles: (ids: string[], where: Move) => void
  assign: (ids: string[], destination: string | null, passenger?: Passenger) => void
  importDropped: (list: Dropped[], target: string, where: string) => Promise<void>
}) => {
  const [dragged, setDragged] = useState<string[]>([])
  const [draggedFiles, setDraggedFiles] = useState<string[]>([])
  const [overTarget, setOverTarget] = useState<string | null>(null)

  /* What is carried travels in here, not in the drag itself — the board is on both ends of it. The
     drag is still handed what it is, because an engine handed nothing cancels the drag before it
     starts: the window's own draws no card and never reaches a place, where a browser lets it by. */
  const carrying = (e: React.DragEvent | undefined, said: string) => {
    if (!e) return
    e.dataTransfer.setData('text/plain', said)
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  /* a whole jump, picked up by its line: dropping it on a place files every file in it at once,
     and on Tandems that is what makes the jump a passenger's (RULES, Jumps) */
  const startJumpDrag = (groupId: string, e?: React.DragEvent) => {
    const jump = groups.find((g) => g.id === groupId)
    carrying(e, (jump && passengerOf(jump)) || jump?.label || 'a jump')
    setDraggedFiles([])
    setDragged([groupId])
  }

  const startFileDrag = (file: ManifestFile, e?: React.DragEvent) => {
    if (!file.id) return
    /* a thumbnail sits inside a draggable jump card — only the file must travel */
    e?.stopPropagation()
    const travelling = pickedFiles.includes(file.id) ? pickedFiles : [file.id]
    carrying(e, travelling.length > 1 ? `${travelling.length} files` : file.filename)
    setDragged([])
    setDraggedFiles(travelling)
  }

  /* dragend bubbles, so one handler clears the highlight however a drag ends */
  const endDrag = () => {
    setOverTarget(null)
    setDraggedFiles([])
    setDragged([])
  }

  /* onDragLeave also fires when the pointer crosses a child, so `contains` stops the flicker */
  const leaveTarget = (key: string) => (e: React.DragEvent) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
    setOverTarget((current) => (current === key ? null : current))
  }

  /* A jump accepts files dropped from anywhere, so a photo can change jump. The same jump is a
     target in more than one place at once — its line and its chip in the day header — so each says
     which it is: one key per thing on screen, or lighting one would light them all. */
  const groupDropTarget = (groupId: string, scope: 'group' | 'chip' = 'group') => {
    const key = `${scope}:${groupId}`
    if (frozen.has(groupId)) return {}
    const jump = groups.find((g) => g.id === groupId)
    return {
      'data-drop-target': `group:${groupId}`,
      'data-drop-where': (jump && passengerOf(jump)) || jump?.label || 'this jump',
      onDragOver: (e: React.DragEvent) => {
        if (draggedFiles.length === 0 && !fromComputer(e)) return
        e.preventDefault()
        e.stopPropagation()
        if (draggedFiles.length > 0) showIntent(e)
        setOverTarget(key)
      },
      onDragLeave: leaveTarget(key),
      onDrop: (e: React.DragEvent) => {
        setOverTarget(null)
        const carried = fromComputer(e) ? droppedIn(e) : []
        if (carried.length > 0) {
          e.preventDefault()
          e.stopPropagation()
          const group = groups.find((g) => g.id === groupId)
          void importDropped(
            carried,
            `group:${groupId}`,
            (group && passengerOf(group)) || group?.label || 'this jump'
          )
          return
        }
        if (draggedFiles.length === 0) return
        e.preventDefault()
        e.stopPropagation()
        moveFiles(draggedFiles, { targetGroupId: groupId, copy: copying(e) })
        setDraggedFiles([])
      }
    }
  }

  /* `key` names the thing on screen that lights up, which is not always the destination: the same
     dropzone is a target in the menu and on its own card, and each has to light on its own. */
  const dropTarget = (
    destination: string | null,
    named?: string,
    /* a named passenger: what is dropped joins them rather than starting a tandem of its own */
    into?: { passenger: Passenger; hostId: string }
  ) => {
    const key = named ?? (destination === null ? 'sort' : `dest:${destination}`)
    /* the sorting area takes files back; a destination card takes whole jumps as well */
    const accepts =
      destination === null ? draggedFiles.length > 0 : dragged.length > 0 || draggedFiles.length > 0
    /* From the computer: into a passenger's tandem, a dropzone as lone files, or the sorting area.
       The Tandems heading is not a place for a file — it has to be somebody's. */
    const incoming = into
      ? { target: `group:${into.hostId}`, where: passengerName(into.passenger) }
      : destination === null
        ? { target: 'sort', where: 'Fresh files' }
        : destination === TANDEMS
          ? null
          : { target: `dest:${destination}`, where: destination }
    return {
      /* What a file let go on this would join, said on the element itself: SkyDock's own window
         hands the drop to the app rather than to the page, with where on the screen it happened,
         so the board has only the point to find its way back from. */
      ...(incoming
        ? { 'data-drop-target': incoming.target, 'data-drop-where': incoming.where }
        : {}),
      onDragOver: (e: React.DragEvent) => {
        if (!accepts && !(fromComputer(e) && incoming)) return
        e.preventDefault()
        /* only a passenger's entry is a jump to copy into; a place has no jump to hold a copy */
        if (into && draggedFiles.length > 0) showIntent(e)
        setOverTarget(key)
      },
      onDragLeave: leaveTarget(key),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        setOverTarget(null)
        const carried = fromComputer(e) ? droppedIn(e) : []
        if (carried.length > 0) {
          if (incoming) void importDropped(carried, incoming.target, incoming.where)
          return
        }
        if (draggedFiles.length > 0)
          moveFiles(
            draggedFiles,
            into
              ? { targetGroupId: into.hostId, copy: copying(e) }
              : { destination, newGroup: destination === TANDEMS }
          )
        else if (dragged.length > 0) assign(dragged, destination, into?.passenger)
        setDragged([])
        setDraggedFiles([])
      }
    }
  }

  /* A folder on the left. A camera day takes things back to the sorting area, as Unsorted does; a
     passenger means "this is theirs too", so it joins their tandem; the Tandems heading and No name yet
     start a tandem of its own. What the storage holds is not somewhere a file can be put. */
  const placeDrop = (target: Place) => {
    const key = placeKey(target)
    const host =
      target.kind === 'pax'
        ? groups.find((g) => inTandemsCard(g) && passengerOf(g) === target.name)
        : undefined
    const props =
      target.kind === 'storage' || (host && frozen.has(host.id))
        ? {}
        : target.kind === 'sort'
          ? dropTarget(null, key)
          : target.kind === 'dz'
            ? dropTarget(target.name, key)
            : host?.passenger
              ? dropTarget(TANDEMS, key, { passenger: host.passenger, hostId: host.id })
              : dropTarget(TANDEMS, key)
    return { ...props, 'data-place': key }
  }

  return {
    dragging: draggedFiles.length > 0,
    overTarget,
    startJumpDrag,
    startFileDrag,
    endDrag,
    groupDropTarget,
    placeDrop
  }
}

export { useDragAndDrop }
export type { Move }
