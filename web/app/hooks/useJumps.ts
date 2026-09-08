import { useState } from 'react'
import type { ManifestJump } from '../components/types'
import { groupJumpsByDay } from '../components/utils'
import { useSafeFetcher } from '../helpers/routing'

type UseJumpsReturn = {
  jumps: ManifestJump[]
  jumpsByDay: ReturnType<typeof groupJumpsByDay>
  setJumps: (next: ManifestJump[]) => void
  saveJumps: (next: ManifestJump[]) => void
}

const useJumps = (initialJumps: ManifestJump[]): UseJumpsReturn => {
  const [jumps, setJumps] = useState<ManifestJump[]>(initialJumps)
  const { submit } = useSafeFetcher()
  const jumpsByDay = groupJumpsByDay(jumps)

  const saveJumps = (next: ManifestJump[]) => {
    submit({ url: '/api/manifest', actionArgs: { intent: 'save-jumps', jumps: next } })
  }

  return { jumps, jumpsByDay, setJumps, saveJumps }
}

export { useJumps }
export type { UseJumpsReturn }
