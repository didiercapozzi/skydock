import { useEffect, useState } from 'react'
import type { Modifiers } from '../components/file-list'
import type { ManifestFile } from '../components/types'

/* What is selected, the way a file manager has it: a click selects a file, ⌘/ctrl-click adds or
   removes one, shift-click takes a range, and a double-click or Enter opens it. A jump can be
   selected instead, by its line. The arrow keys step through the files in the order they are drawn,
   Escape clears, Delete sends what is selected back to Unsorted, and ⌘A takes every file on screen.
   Two jumps can be put side by side to compare. */
const useSelection = ({
  order,
  paused,
  onOpen,
  onDelete
}: {
  /* the files on screen, in the order they are drawn */
  order: ManifestFile[]
  /* a dialog or the preview has the keyboard */
  paused: boolean
  onOpen: (file: ManifestFile) => void
  onDelete: (ids: string[]) => void
}) => {
  const [pickedFiles, setPickedFiles] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [pickedJump, setPickedJump] = useState<string | null>(null)
  const [comparing, setComparing] = useState<[string, string] | null>(null)

  const pickOnly = (ids: string[], from: string | null) => {
    setPickedFiles(ids)
    setAnchor(from)
    setPickedJump(null)
  }

  const idsOf = (files: ManifestFile[]) => files.flatMap((f) => (f.id ? [f.id] : []))

  const rangeTo = (id: string, within: string[]) => {
    const from = anchor ? within.indexOf(anchor) : -1
    const to = within.indexOf(id)
    if (from === -1 || to === -1) return null
    return within.slice(Math.min(from, to), Math.max(from, to) + 1)
  }

  const clickFile = (file: ManifestFile, lane: ManifestFile[], e: Modifiers) => {
    const id = file.id
    if (!id) {
      onOpen(file)
      return
    }
    setPickedJump(null)
    if (e.shiftKey) {
      const range = rangeTo(id, idsOf(lane))
      setPickedFiles(range ? [...new Set([...pickedFiles, ...range])] : [...pickedFiles, id])
      if (!range) setAnchor(id)
      return
    }
    if (e.ctrlKey || e.metaKey) {
      setPickedFiles(
        pickedFiles.includes(id) ? pickedFiles.filter((x) => x !== id) : [...pickedFiles, id]
      )
      setAnchor(id)
      return
    }
    pickOnly([id], id)
  }

  const selectJump = (groupId: string) => {
    setPickedFiles([])
    setAnchor(null)
    setPickedJump(pickedJump === groupId ? null : groupId)
  }

  const selectFiles = (files: ManifestFile[]) => {
    const ids = idsOf(files)
    pickOnly(ids, ids[0] ?? null)
  }

  const clear = () => pickOnly([], null)

  /* the keys belong to the window, so this listens there */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused) return
      /* never take a key from a field being typed in */
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
        return
      if (comparing) {
        if (e.key === 'Escape') setComparing(null)
        return
      }
      const ids = idsOf(order)
      if (e.key === 'Escape') {
        clear()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && pickedFiles.length > 0) {
        e.preventDefault()
        onDelete(pickedFiles)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        pickOnly(ids, ids[0] ?? null)
        return
      }
      if (e.key === 'Enter' && pickedFiles.length === 1) {
        const file = order.find((f) => f.id === pickedFiles[0])
        if (file) onOpen(file)
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const at = anchor ? ids.indexOf(anchor) : -1
      const next = ids[Math.max(0, Math.min(ids.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (!next) return
      if (e.shiftKey) {
        setPickedFiles([...new Set([...pickedFiles, next])])
        setAnchor(next)
      } else pickOnly([next], next)
      document
        .querySelector(`[data-file="${CSS.escape(next)}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return {
    pickedFiles,
    pickedJump,
    clickFile,
    selectJump,
    selectFiles,
    clear,
    comparing,
    setComparing
  }
}

export { useSelection }
