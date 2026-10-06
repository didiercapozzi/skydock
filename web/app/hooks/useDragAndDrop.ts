import { isMontage, passengerName, passengerOf } from '@skydock/scripts'
import { t } from '@lingui/core/macro'
import { useState } from 'react'
import type { Passenger } from '../components/montage-card'
import type { Dropped } from '../helpers/import'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { droppedIn, fromComputer } from '../helpers/import'
import { placeKey } from '../helpers/places'
import type { Place } from '../helpers/places'

type Move = {
  destination?: string | null
  targetGroupId?: string
  newGroup?: boolean
  name?: string
  startsAt?: number
  copy?: boolean
}

const copying = (e: React.DragEvent) => e.altKey || e.ctrlKey
const showIntent = (e: React.DragEvent) => {
  e.dataTransfer.dropEffect = copying(e) ? 'copy' : 'move'
}

const useDragAndDrop = ({
  groups,
  labels,
  frozen,
  moveFiles,
  assign,
  toMontage,
  importDropped,
  askMontageName,
  onFiled
}: {
  groups: ManifestGroup[]
  labels: Map<string, string>
  frozen: Set<string>
  moveFiles: (ids: string[], where: Move) => void
  assign: (ids: string[], destination: string | null) => void
  toMontage: (ids: string[], passenger?: Passenger) => void
  askMontageName: (what: { groupId: string } | { fileIds: string[] }) => void
  importDropped: (list: Dropped[], target: string, where: string) => Promise<void>
  onFiled: (destination: string) => void
}) => {
  const [dragged, setDragged] = useState<string[]>([])
  const [draggedFiles, setDraggedFiles] = useState<string[]>([])
  const [overTarget, setOverTarget] = useState<string | null>(null)

  const carrying = (e: React.DragEvent | undefined, said: string) => {
    if (!e) return
    e.dataTransfer.setData('text/plain', said)
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  const startJumpDrag = (groupId: string, e?: React.DragEvent) => {
    carrying(e, labels.get(groupId) ?? t`a jump`)
    setDraggedFiles([])
    setDragged([groupId])
  }

  const startFileDrag = (file: ManifestFile, picked: string[], e?: React.DragEvent) => {
    if (!file.id) return
    e?.stopPropagation()
    const travelling = picked.includes(file.id) ? picked : [file.id]
    const count = travelling.length
    carrying(e, count > 1 ? t`${count} files` : file.filename)
    setDragged([])
    setDraggedFiles(travelling)
  }

  const endDrag = () => {
    setOverTarget(null)
    setDraggedFiles([])
    setDragged([])
  }

  const leaveTarget = (key: string) => (e: React.DragEvent) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
    setOverTarget((current) => (current === key ? null : current))
  }

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

  const land = (
    to: { kind: 'sort' } | { kind: 'dz'; name: string } | { kind: 'montage' },
    what: { files: string[] } | { jumps: string[] },
    how: { into?: { passenger: Passenger; hostId: string }; copy?: boolean } = {}
  ) => {
    const destination = to.kind === 'dz' ? to.name : null
    const { into, copy = false } = how
    if ('files' in what) {
      if (what.files.length === 0) return
      if (into) moveFiles(what.files, { targetGroupId: into.hostId, copy })
      else if (to.kind === 'montage') askMontageName({ fileIds: what.files })
      else moveFiles(what.files, { destination })
    } else {
      const [first] = what.jumps
      if (!first) return
      if (into) toMontage(what.jumps, into.passenger)
      else if (to.kind === 'montage') askMontageName({ groupId: first })
      else assign(what.jumps, destination)
    }
    if (destination) onFiled(destination)
  }

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

  const dropTarget = (
    to: { kind: 'sort' } | { kind: 'dz'; name: string } | { kind: 'montage' },
    named?: string,
    into?: { passenger: Passenger; hostId: string }
  ) => {
    const key = named ?? (to.kind === 'dz' ? `dest:${to.name}` : to.kind)
    const accepts =
      to.kind === 'sort' ? draggedFiles.length > 0 : dragged.length > 0 || draggedFiles.length > 0
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

  const placeDrop = (target: Place) => {
    const key = placeKey(target)
    const host =
      target.kind === 'pax'
        ? groups.find((g) => isMontage(g) && passengerOf(g) === target.name)
        : undefined
    const props =
      target.kind === 'camera' || target.kind === 'bin' || (host && frozen.has(host.id))
        ? {}
        : target.kind === 'sort'
          ? dropTarget({ kind: 'sort' }, key)
          : target.kind === 'dz'
            ? dropTarget({ kind: 'dz', name: target.name }, key)
            : host?.passenger
              ? dropTarget({ kind: 'montage' }, key, { passenger: host.passenger, hostId: host.id })
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
