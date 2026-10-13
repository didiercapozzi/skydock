import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Modifiers } from '../components/file-list'
import type { ManifestFile } from '../components/types'
import { typingInField } from '../helpers/keys'
import { idsOf } from '@skydock/scripts/client'

const SECOND_CLICK_MS = 400

const useSelection = ({
  order,
  paused,
  pickable,
  onOpen,
  onDelete
}: {
  order: ManifestFile[]
  pickable: (id: string) => boolean
  paused: boolean
  onOpen: (file: ManifestFile) => void
  onDelete: (ids: string[]) => void
}) => {
  const [picks, setPickedFiles] = useState<string[]>([])
  const pickedFiles = picks.filter(pickable)
  const [anchor, setAnchor] = useState<string | null>(null)
  const [pickedJump, setPickedJump] = useState<string | null>(null)
  const [comparing, setComparing] = useState<[string, string] | null>(null)
  const [previewed, setPreviewed] = useState<string | null>(null)
  const lastClick = useRef<{ id: string; at: number } | null>(null)

  const pickOnly = (ids: string[], from: string | null) => {
    setPickedFiles(ids)
    setAnchor(from)
    setPickedJump(null)
    setPreviewed(null)
  }

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

  const selectJump = (groupId: string, e?: Modifiers, open?: string) => {
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

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (paused) return
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
  })
  useEffect(() => {
    const listen = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', listen)
    return () => window.removeEventListener('keydown', listen)
  }, [])

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
