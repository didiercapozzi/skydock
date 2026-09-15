import { useRef, useState } from 'react'
import { moveFilesBetweenGroups, reorderFilesInGroup } from '@skydock/scripts'
import type {
  DragData,
  DropDialog,
  DropHint,
  ManifestFile,
  ManifestGroup
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
    targetGroupId: string,
    groups: ManifestGroup[],
    onGroupsChange: (next: ManifestGroup[]) => void
  ) => void
  handleDragOver: (e: React.DragEvent, targetGroupId: string) => void
  handleDragLeave: () => void
  handleDragEnd: () => void
  executeDrop: (
    action: 'move' | 'copy',
    groups: ManifestGroup[],
    manifestFiles: ManifestFile[],
    onGroupsChange: (next: ManifestGroup[]) => void,
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
    targetGroupId: string,
    groups: ManifestGroup[],
    onGroupsChange: (next: ManifestGroup[]) => void
  ) => {
    const data = dragDataRef.current
    if (!data) return
    setDropHint(null)
    const target = groups.find((g) => g.id === targetGroupId)
    if (target?.processed === true) return
    const groupIds = Object.keys(data.groups)
    if (groupIds.length === 1 && groupIds[0] === targetGroupId) {
      const toIndex = getDropIndex(e.currentTarget as HTMLElement, e.clientY)
      const paths = data.groups[targetGroupId]
      const next = reorderFilesInGroup(groups, targetGroupId, paths, toIndex)
      dragDataRef.current = null
      onGroupsChange(next)
      return
    }
    setDropDialog({
      x: e.clientX,
      y: e.clientY,
      groups: data.groups,
      targetGroupId
    })
  }

  const handleDragOver = (e: React.DragEvent, targetGroupId: string) => {
    const index = getDropIndex(e.currentTarget as HTMLElement, e.clientY)
    setDropHint((prev) =>
      prev && prev.groupId === targetGroupId && prev.index === index
        ? prev
        : { groupId: targetGroupId, index }
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
    groups: ManifestGroup[],
    manifestFiles: ManifestFile[],
    onGroupsChange: (next: ManifestGroup[]) => void,
    clearSelection: () => void
  ) => {
    if (!dropDialog) return
    const { groups: fileGroups, targetGroupId } = dropDialog
    const next = moveFilesBetweenGroups(groups, manifestFiles, fileGroups, targetGroupId, action)
    dragDataRef.current = null
    onGroupsChange(next)
    clearSelection()
    setDropDialog(null)
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
