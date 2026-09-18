import { useEffect, useState } from 'react'
import type { Modifiers } from '../components/file-list'
import type { ManifestFile } from '../components/types'

/* Looking and picking are two different things. A click only looks: the file shows in the
   inspector and nothing is picked. A file is picked by its tick, by ⌘/ctrl-click, or with shift for
   a range — so a picked set is never started by accident on the way to looking at something. A
   double-click, or Enter, opens it in the cropper. A jump can be selected instead, by its line. The
   arrow keys step the look through the files in the order they are drawn (shift adds them to the
   picks), Escape clears, Delete sends the picks — or, with none, the file looked at — back to
   Unsorted, and ⌘A picks every file on screen. Two jumps can be put side by side to compare. */
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
  /* the file being looked at, which is not the same as picked */
  const [previewed, setPreviewed] = useState<string | null>(null)

  const pickOnly = (ids: string[], from: string | null) => {
    setPickedFiles(ids)
    setAnchor(from)
    setPickedJump(null)
    setPreviewed(null)
  }

  /* picking is the latest thing done, so the inspector turns to the picks */
  const togglePick = (id: string) => {
    setPickedFiles(
      pickedFiles.includes(id) ? pickedFiles.filter((x) => x !== id) : [...pickedFiles, id]
    )
    setAnchor(id)
    setPickedJump(null)
    setPreviewed(null)
  }

  const pickFile = (file: ManifestFile) => {
    if (file.id) togglePick(file.id)
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
      setPreviewed(null)
      return
    }
    if (e.ctrlKey || e.metaKey) {
      togglePick(id)
      return
    }
    setPreviewed(id)
    setAnchor(id)
  }

  const selectJump = (groupId: string) => {
    setPickedFiles([])
    setAnchor(null)
    setPreviewed(null)
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
      const targets = pickedFiles.length ? pickedFiles : previewed ? [previewed] : []
      if ((e.key === 'Delete' || e.key === 'Backspace') && targets.length > 0) {
        e.preventDefault()
        onDelete(targets)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        pickOnly(ids, ids[0] ?? null)
        return
      }
      if (e.key === 'Enter' && targets.length === 1) {
        const file = order.find((f) => f.id === targets[0])
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
        setPreviewed(null)
      } else setPreviewed(next)
      setAnchor(next)
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
    previewed,
    clickFile,
    pickFile,
    selectJump,
    selectFiles,
    clear,
    comparing,
    setComparing
  }
}

export { useSelection }
