import { useEffect, useState } from 'react'
import type { Modifiers } from '../components/file-list'
import type { ManifestFile } from '../components/types'

/* Which files are picked, and which two jumps are being compared. A plain click previews while
   nothing is picked and extends the picking once it started; shift takes a range; ⌘/ctrl adds one;
   Escape clears; Delete sends the picked files back to the sorting area. */
const useSelection = ({ onDelete }: { onDelete: (ids: string[]) => void }) => {
  const [picked, setPicked] = useState<string[]>([])
  const [pickedFiles, setPickedFiles] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)

  const clickFile = (
    file: ManifestFile,
    lane: ManifestFile[],
    e: Modifiers,
    onPreview: () => void
  ) => {
    const id = file.id
    if (!id) {
      onPreview()
      return
    }
    const ids = lane.flatMap((f) => (f.id ? [f.id] : []))
    /* Shift is always picking, never previewing. With a start already in this row it takes the
       range; with none yet — the first shift-click on the board, or the start was in another row —
       it picks this one and makes it the start. */
    if (e.shiftKey) {
      if (anchor && ids.includes(anchor)) {
        const from = ids.indexOf(anchor)
        const to = ids.indexOf(id)
        const range = ids.slice(Math.min(from, to), Math.max(from, to) + 1)
        setPickedFiles([...new Set([...pickedFiles, ...range])])
      } else {
        setPickedFiles(pickedFiles.includes(id) ? pickedFiles : [...pickedFiles, id])
        setAnchor(id)
      }
      return
    }
    if (e.ctrlKey || e.metaKey || pickedFiles.length > 0) {
      setPickedFiles(
        pickedFiles.includes(id) ? pickedFiles.filter((x) => x !== id) : [...pickedFiles, id]
      )
      setAnchor(id)
      return
    }
    setAnchor(id)
    onPreview()
  }

  const clearFiles = () => {
    setPickedFiles([])
    setAnchor(null)
  }

  const selectAll = (files: ManifestFile[]) => {
    const ids = files.flatMap((f) => (f.id ? [f.id] : []))
    const every = ids.length > 0 && ids.every((id) => pickedFiles.includes(id))
    setPickedFiles(
      every ? pickedFiles.filter((id) => !ids.includes(id)) : [...new Set([...pickedFiles, ...ids])]
    )
  }

  /* the keys are the window's, so this is a listener on it */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* never steal Delete or Backspace from the passenger name fields */
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return
      /* while comparing, Escape closes the dialog and nothing else reaches the board */
      if (comparing) {
        if (e.key === 'Escape') queueMicrotask(() => setComparing(false))
        return
      }
      if (e.key === 'Escape') {
        queueMicrotask(clearFiles)
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (pickedFiles.length === 0) return
      e.preventDefault()
      queueMicrotask(() => onDelete(pickedFiles))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return {
    picked,
    setPicked,
    pickedFiles,
    clearFiles,
    clickFile,
    selectAll,
    comparing,
    setComparing
  }
}

export { useSelection }
