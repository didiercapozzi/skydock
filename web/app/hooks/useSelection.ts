import { useEffect, useRef, useState } from 'react'
import type { Modifiers } from '../components/file-list'
import type { ManifestFile } from '../components/types'
import { typingInField } from '../helpers/keys'

/* How long after a click a second one on the same file is the same gesture. The two are paired here
   rather than listened for as a double-click, because a file can also be dragged and the engine the
   app's own window draws with never pairs them on something draggable: the drag takes the second
   press. Two clicks are two clicks everywhere. */
const SECOND_CLICK_MS = 400

/* Looking and picking are two different things. A click only looks: the file shows in the
   inspector and nothing is picked. A file is picked by its tick, by ⌘/ctrl-click, or with shift for
   a range — so a picked set is never started by accident on the way to looking at something. A
   double-click, or Enter, opens it in the cropper. A jump can be selected instead, by its line. The
   arrow keys step the look through the files in the order they are drawn (shift adds them to the
   picks), Escape clears, Delete sends the picks — or, with none, the file looked at — back to
   Unsorted, and ⌘A picks every file on screen. Two jumps can be put side by side to compare.

   A file that cannot move is never picked, whichever way it is asked for: picking is choosing what
   to move, so a picked file nothing can be done with only stands in the way of the ones that can. */
const useSelection = ({
  order,
  paused,
  pickable,
  onOpen,
  onDelete
}: {
  /* the files on screen, in the order they are drawn */
  order: ManifestFile[]
  /* whether a file can be picked at all — uploaded, freed, or in a tandem with an edit, it cannot */
  pickable: (id: string) => boolean
  /* a dialog or the preview has the keyboard */
  paused: boolean
  onOpen: (file: ManifestFile) => void
  onDelete: (ids: string[]) => void
}) => {
  const [picks, setPickedFiles] = useState<string[]>([])
  /* A file can stop being pickable while it is picked — the tandem it is in gets an edit, or goes up
     to the storage — and then it simply stops being one of the picks. */
  const pickedFiles = picks.filter(pickable)
  const [anchor, setAnchor] = useState<string | null>(null)
  const [pickedJump, setPickedJump] = useState<string | null>(null)
  const [comparing, setComparing] = useState<[string, string] | null>(null)
  /* the file being looked at, which is not the same as picked */
  const [previewed, setPreviewed] = useState<string | null>(null)
  /* the last plain click, waiting to see whether another one makes it an opening */
  const lastClick = useRef<{ id: string; at: number } | null>(null)

  const pickOnly = (ids: string[], from: string | null) => {
    setPickedFiles(ids)
    setAnchor(from)
    setPickedJump(null)
    setPreviewed(null)
  }

  /* picking is the latest thing done, so the inspector turns to the picks */
  const togglePick = (id: string) => {
    if (!pickedFiles.includes(id) && !pickable(id)) return
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
  const pickableOf = (ids: string[]) => ids.filter(pickable)

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
    /* picking is not opening, so a click that picks starts no pair and continues none */
    if (e.shiftKey) {
      lastClick.current = null
      const range = rangeTo(id, idsOf(lane))
      setPickedFiles(pickableOf([...new Set([...pickedFiles, ...(range ?? [id])])]))
      if (!range) setAnchor(id)
      setPreviewed(null)
      return
    }
    if (e.ctrlKey || e.metaKey) {
      lastClick.current = null
      togglePick(id)
      return
    }
    const before = lastClick.current
    const now = Date.now()
    lastClick.current = { id, at: now }
    if (before?.id === id && now - before.at < SECOND_CLICK_MS) {
      lastClick.current = null
      onOpen(file)
      return
    }
    setPreviewed(id)
    setAnchor(id)
  }

  /* With one jump selected, ⌘/ctrl-clicking a second puts the two side by side — the one way two
     jumps are ever picked at once, so it cannot happen on the way to looking at one. */
  const selectJump = (groupId: string, e?: Modifiers, open?: string) => {
    /* the jump already open counts as selected, whether or not it was ever clicked */
    const first = pickedJump ?? open
    if ((e?.ctrlKey || e?.metaKey) && first && first !== groupId) {
      setComparing([first, groupId])
      return
    }
    setPickedFiles([])
    setAnchor(null)
    setPreviewed(null)
    setPickedJump(pickedJump === groupId ? null : groupId)
  }

  const selectFiles = (files: ManifestFile[]) => {
    const ids = pickableOf(idsOf(files))
    pickOnly(ids, ids[0] ?? null)
  }

  const clear = () => pickOnly([], null)

  /* the keys belong to the window, so this listens there */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused) return
      /* never take a key from a field being typed in */
      if (typingInField(e)) return
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
        const all = pickableOf(ids)
        pickOnly(all, all[0] ?? null)
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
        setPickedFiles(pickableOf([...new Set([...pickedFiles, next])]))
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
