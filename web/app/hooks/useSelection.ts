import { useRef, useState } from 'react'
import type { ManifestFile, ManifestJump, SelectionMap } from '../components/types'
import { updateSelection } from './selection.logic'

type UseSelectionReturn = {
  selection: SelectionMap
  selectedCount: number
  handleSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  clearSelection: () => void
  setSelection: (next: SelectionMap) => void
}

const useSelection = (jumps: ManifestJump[], unassignedFiles: ManifestFile[]) => {
  const [selection, setSelectionState] = useState<SelectionMap>({})
  const lastClickedRef = useRef<string | null>(null)

  const selectedCount = Object.values(selection).reduce(
    (sum, group) => sum + Object.keys(group).length,
    0
  )

  const handleSelect = (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => {
    const prevLast = lastClickedRef.current
    lastClickedRef.current = filePath

    const allPaths = [
      ...unassignedFiles.map((f) => f.path),
      ...jumps.flatMap((j) => j.files.map((f) => f.path))
    ]

    setSelectionState((prev) =>
      updateSelection(prev, {
        groupId,
        filePath,
        ctrlKey,
        shiftKey,
        prevLast,
        allPaths,
        unassignedFiles,
        jumps
      })
    )
  }

  const clearSelection = () => {
    setSelectionState({})
  }

  const setSelection = (next: SelectionMap) => {
    setSelectionState(next)
  }

  return { selection, selectedCount, handleSelect, clearSelection, setSelection }
}

export { useSelection }
export type { UseSelectionReturn }
