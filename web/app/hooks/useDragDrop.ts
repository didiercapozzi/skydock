import { useRef, useState } from 'react'
import { moveFilesBetweenJumps, reorderFilesInJump } from '@skydock/scripts'
import type {
  DragData,
  DropDialog,
  DropHint,
  ManifestFile,
  ManifestJump
} from '../components/types'
import { getDropIndex } from '../components/utils'

type UseDragDropReturn = {
  dropDialog: DropDialog | null
  dropHint: DropHint | null
  handleDragStart: (
    e: React.DragEvent,
    groupId: string,
    paths: string[],
    selection?: Record<string, Record<string, boolean>>
  ) => void
  handleTrayDragStart: (
    e: React.DragEvent,
    selection: Record<string, Record<string, boolean>>
  ) => void
  handleDrop: (
    e: React.DragEvent,
    targetJumpId: string,
    jumps: ManifestJump[],
    saveJumps: (next: ManifestJump[]) => void,
    setJumps: (next: ManifestJump[]) => void
  ) => void
  handleDragOver: (e: React.DragEvent, targetJumpId: string) => void
  handleDragLeave: () => void
  handleDragEnd: () => void
  executeDrop: (
    action: 'move' | 'copy',
    jumps: ManifestJump[],
    manifestFiles: ManifestFile[],
    setJumps: (next: ManifestJump[]) => void,
    saveJumps: (next: ManifestJump[]) => void,
    clearSelection: () => void
  ) => void
  setDropDialog: (next: DropDialog | null) => void
}

const useDragDrop = () => {
  const dragDataRef = useRef<DragData | null>(null)
  const [dropDialog, setDropDialog] = useState<DropDialog | null>(null)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)

  const handleDragStart = (
    e: React.DragEvent,
    groupId: string,
    paths: string[],
    selection?: Record<string, Record<string, boolean>>
  ) => {
    const selectedPaths = selection?.[groupId] ? Object.keys(selection[groupId]) : paths
    dragDataRef.current = { groups: { [groupId]: selectedPaths } }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(selectedPaths))
  }

  const handleTrayDragStart = (
    e: React.DragEvent,
    selection: Record<string, Record<string, boolean>>
  ) => {
    const groups: Record<string, string[]> = {}
    for (const [groupId, files] of Object.entries(selection)) groups[groupId] = Object.keys(files)
    const allPaths = Object.values(groups).flat()
    dragDataRef.current = { groups }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(allPaths))
  }

  const handleDrop = (
    e: React.DragEvent,
    targetJumpId: string,
    jumps: ManifestJump[],
    saveJumps: (next: ManifestJump[]) => void,
    setJumps: (next: ManifestJump[]) => void
  ) => {
    const data = dragDataRef.current
    if (!data) return
    dragDataRef.current = null
    setDropHint(null)
    const target = jumps.find((j) => j.id === targetJumpId)
    if (target?.processed === true) return
    const groupIds = Object.keys(data.groups)
    if (groupIds.length === 1 && groupIds[0] === targetJumpId) {
      const toIndex = getDropIndex(e.currentTarget as HTMLElement, e.clientY)
      const paths = data.groups[targetJumpId]
      const next = reorderFilesInJump(jumps, targetJumpId, paths, toIndex)
      setJumps(next)
      saveJumps(next)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setDropDialog({
      x: e.clientX - rect.left + rect.left,
      y: e.clientY,
      groups: data.groups,
      targetJumpId
    })
  }

  const handleDragOver = (e: React.DragEvent, targetJumpId: string) => {
    const index = getDropIndex(e.currentTarget as HTMLElement, e.clientY)
    setDropHint((prev) =>
      prev && prev.jumpId === targetJumpId && prev.index === index
        ? prev
        : { jumpId: targetJumpId, index }
    )
  }

  const handleDragLeave = () => {
    setDropHint(null)
  }

  const handleDragEnd = () => {
    dragDataRef.current = null
    setDropHint(null)
  }

  const executeDrop = (
    action: 'move' | 'copy',
    jumps: ManifestJump[],
    manifestFiles: ManifestFile[],
    setJumps: (next: ManifestJump[]) => void,
    saveJumps: (next: ManifestJump[]) => void,
    clearSelection: () => void
  ) => {
    if (!dropDialog) return
    const { groups, targetJumpId } = dropDialog
    const next = moveFilesBetweenJumps(jumps, manifestFiles, groups, targetJumpId, action)
    setJumps(next)
    clearSelection()
    setDropDialog(null)
    saveJumps(next)
  }

  return {
    dropDialog,
    dropHint,
    handleDragStart,
    handleTrayDragStart,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    executeDrop,
    setDropDialog
  }
}

export { useDragDrop }
export type { UseDragDropReturn }
