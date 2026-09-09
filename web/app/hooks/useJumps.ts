import { useState } from 'react'
import type { ManifestJump } from '../components/types'
import { groupJumpsByDay } from '../components/utils'
import { useSafeFetcher } from '../helpers/routing'

type UseJumpsReturn = {
  jumps: ManifestJump[]
  jumpsByDay: ReturnType<typeof groupJumpsByDay>
  setJumps: (next: ManifestJump[]) => void
  saveJumps: (next: ManifestJump[]) => void
  updateJumps: (next: ManifestJump[]) => void
}

const useJumps = (initialJumps: ManifestJump[]) => {
  const [jumps, setJumps] = useState<ManifestJump[]>(initialJumps)
  const { submit } = useSafeFetcher()
  const jumpsByDay = groupJumpsByDay(jumps)

  const saveJumps = (next: ManifestJump[]) => {
    submit({ url: '/api/manifest', actionArgs: { intent: 'save-jumps', jumps: next } })
  }

  const updateJumps = (next: ManifestJump[]) => {
    const withDirty = next.map((j) => {
      const prev = jumps.find((p) => p.id === j.id)
      if (!prev?.processed) return j
      if (prev.label !== j.label) return { ...j, processed: false, publish: undefined }
      if (prev.day !== j.day) return { ...j, processed: false, publish: undefined }
      if (JSON.stringify(prev.passenger) !== JSON.stringify(j.passenger))
        return { ...j, processed: false, publish: undefined }
      if (prev.files.length !== j.files.length)
        return { ...j, processed: false, publish: undefined }
      for (let i = 0; i < j.files.length; i++) {
        const a = prev.files[i]
        const b = j.files[i]
        if (!a || !b) return { ...j, processed: false, publish: undefined }
        if (
          a.path !== b.path ||
          a.id !== b.id ||
          a.cropStart !== b.cropStart ||
          a.cropEnd !== b.cropEnd ||
          a.mtime !== b.mtime
        )
          return { ...j, processed: false, publish: undefined }
      }
      return j
    })
    setJumps(withDirty)
    submit({ url: '/api/manifest', actionArgs: { intent: 'save-jumps', jumps: withDirty } })
  }

  return { jumps, jumpsByDay, setJumps, saveJumps, updateJumps }
}

export { useJumps }
export type { UseJumpsReturn }
