import { isMontage, passengerName, passengerOf } from '@skydock/scripts'
import { t } from '@lingui/core/macro'
import { useState } from 'react'
import type { Passenger } from '../components/montage-card'
import type { Dropped } from '../helpers/import'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { droppedIn, fromComputer } from '../helpers/import'
import { placeKey, placeOfGroup, placeOfLoose } from '../helpers/places'
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
  loose,
  labels,
  frozen,
  moveFiles,
  assign,
  toMontage,
  importDropped,
  askMontageName,
  askRemove,
  onFiled
}: {
  groups: ManifestGroup[]
  loose: ManifestFile[]
  /* what each jump is called on the board */
  labels: Map<string, string>
  frozen: Set<string>
  moveFiles: (ids: string[], where: Move) => void
  assign: (ids: string[], destination: string | null) => void
  /* jumps made a montage: joining a named one */
  toMontage: (ids: string[], passenger?: Passenger) => void
  /* a jump or files dropped on the Montages heading: the montage's name is asked for first */
  askMontageName: (what: { groupId: string } | { fileIds: string[] }) => void
  /* files dropped on the bin: the question every removal asks comes first */
  askRemove: (fileIds: string[]) => void
  importDropped: (list: Dropped[], target: string, where: string) => Promise<void>
  /* what the board does once something from it is filed under a destination: goes there */
  onFiled: (destination: string) => void
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

  /* a whole jump, picked up by its line: dropping it on a place files every file in it at once, and
     on the montages it makes the jump a montage (RULES, Jumps) */
  const startJumpDrag = (groupId: string, e?: React.DragEvent) => {
    carrying(e, labels.get(groupId) ?? t`a jump`)
    setDraggedFiles([])
    setDragged([groupId])
  }

  /* the file, and the picks with it when it is one of them: they travel together */
  const startFileDrag = (file: ManifestFile, picked: string[], e?: React.DragEvent) => {
    if (!file.id) return
    /* a thumbnail sits inside a draggable jump card — only the file must travel */
    e?.stopPropagation()
    const travelling = picked.includes(file.id) ? picked : [file.id]
    const count = travelling.length
    carrying(e, count > 1 ? t`${count} files` : file.filename)
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
    return {
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
          void importDropped(carried, `group:${groupId}`, labels.get(groupId) ?? t`this jump`)
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

  /* Where something carried ends up, however it got there — dropped, or sent from a Move to… menu:
     files or whole jumps, back to Fresh files, under a destination, into a named montage, or to
     the Montages heading, which asks for a name first. */
  const land = (
    to: { kind: 'sort' } | { kind: 'dz'; name: string } | { kind: 'montage' } | { kind: 'bin' },
    what: { files: string[] } | { jumps: string[] },
    how: { into?: { passenger: Passenger; hostId: string }; copy?: boolean } = {}
  ) => {
    const destination = to.kind === 'dz' ? to.name : null
    const { into, copy = false } = how
    if ('files' in what) {
      if (what.files.length === 0) return
      if (into) moveFiles(what.files, { targetGroupId: into.hostId, copy })
      else if (to.kind === 'bin') askRemove(what.files)
      else if (to.kind === 'montage') askMontageName({ fileIds: what.files })
      else moveFiles(what.files, { destination })
    } else {
      const [first] = what.jumps
      if (!first || to.kind === 'bin') return
      if (into) toMontage(what.jumps, into.passenger)
      else if (to.kind === 'montage') askMontageName({ groupId: first })
      else assign(what.jumps, destination)
    }
    if (destination) onFiled(destination)
  }

  /* the same, named by a folder on the left */
  const moveTo = (target: Place, what: { files: string[] } | { jumps: string[] }) => {
    if (target.kind === 'sort' || target.kind === 'dz') {
      land(target, what)
      return
    }
    if (target.kind === 'montages') {
      land({ kind: 'montage' }, what)
      return
    }
    if (target.kind !== 'pax') return
    const host = groups.find((g) => isMontage(g) && passengerOf(g) === target.name)
    land(
      { kind: 'montage' },
      what,
      host?.passenger ? { into: { passenger: host.passenger, hostId: host.id } } : {}
    )
  }

  /* `key` names the thing on screen that lights up, which is not always the destination: the same
     dropzone is a target in the menu and on its own card, and each has to light on its own. `to` is
     where it lands: back among the fresh files, a destination, or the montages. */
  const dropTarget = (
    to: { kind: 'sort' } | { kind: 'dz'; name: string } | { kind: 'montage' } | { kind: 'bin' },
    named?: string,
    /* a named montage: what is dropped joins it rather than starting a montage of its own */
    into?: { passenger: Passenger; hostId: string }
  ) => {
    const key = named ?? (to.kind === 'dz' ? `dest:${to.name}` : to.kind)
    /* the sorting area takes files back; a destination card takes whole jumps as well */
    const accepts =
      to.kind === 'sort' || to.kind === 'bin'
        ? draggedFiles.length > 0
        : dragged.length > 0 || draggedFiles.length > 0
    /* From the computer: into a montage, a dropzone as lone files, or the sorting area. The Montages
       heading is not a place for a file — it has to be somebody's. */
    const incoming = into
      ? { target: `group:${into.hostId}`, where: passengerName(into.passenger) }
      : to.kind === 'sort'
        ? { target: 'sort', where: t`Fresh files` }
        : to.kind === 'dz'
          ? { target: `dest:${to.name}`, where: to.name }
          : null
    return {
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
        land(to, draggedFiles.length > 0 ? { files: draggedFiles } : { jumps: dragged }, {
          into,
          copy: copying(e)
        })
        setDragged([])
        setDraggedFiles([])
      }
    }
  }

  /* A folder on the left. Fresh files takes things back to be sorted; a montage means "this is theirs
     too", so it joins it; the Montages heading and No name yet start a montage of its own. What the
     storage holds, and a camera, are not somewhere a file can be put. */
  const placeDrop = (target: Place) => {
    const key = placeKey(target)
    /* what is carried from the board and is all in this place already has nowhere to go: dropping it
       would only make the files start again, so the place does not take it */
    const placeOfFile = (id: string) => {
      const jump = groups.find((g) => g.files.some((f) => f.id === id))
      const lone = loose.find((f) => f.id === id)
      return jump ? placeOfGroup(jump) : lone ? placeOfLoose(lone) : undefined
    }
    const carried = [
      ...dragged.map((id) => groups.find((g) => g.id === id)).map((g) => g && placeOfGroup(g)),
      ...draggedFiles.map(placeOfFile)
    ]
    const staying = carried.length > 0 && carried.every((p) => p && placeKey(p) === key)
    const host =
      target.kind === 'pax'
        ? groups.find((g) => isMontage(g) && passengerOf(g) === target.name)
        : undefined
    const props =
      target.kind === 'camera' || staying || (host && frozen.has(host.id))
        ? {}
        : target.kind === 'bin'
          ? dropTarget({ kind: 'bin' }, key)
          : target.kind === 'sort'
            ? dropTarget({ kind: 'sort' }, key)
            : target.kind === 'dz'
              ? dropTarget({ kind: 'dz', name: target.name }, key)
              : host?.passenger
                ? dropTarget({ kind: 'montage' }, key, {
                    passenger: host.passenger,
                    hostId: host.id
                  })
                : dropTarget({ kind: 'montage' }, key)
    return { ...props, 'data-place': key }
  }

  return {
    dragging: draggedFiles.length > 0,
    overTarget,
    startJumpDrag,
    startFileDrag,
    endDrag,
    groupDropTarget,
    placeDrop,
    moveTo
  }
}

export { useDragAndDrop }
export type { Move }
