import { useState } from 'react'
import type { ManifestGroup } from '../components/types'
import { groupGroupsByDay } from '../components/utils'
import { useSafeFetcher } from '../helpers/routing'

type UseGroupsReturn = {
  groups: ManifestGroup[]
  groupsByDay: ReturnType<typeof groupGroupsByDay>
  setGroups: (next: ManifestGroup[]) => void
  updateGroups: (next: ManifestGroup[]) => void
}

const useGroups = (initialGroups: ManifestGroup[]) => {
  const [groups, setGroups] = useState<ManifestGroup[]>(initialGroups)
  const { submit } = useSafeFetcher()
  const groupsByDay = groupGroupsByDay(groups)

  const updateGroups = (next: ManifestGroup[]) => {
    const withDirty = next.map((g) => {
      const prev = groups.find((p) => p.id === g.id)
      if (!prev?.processed) return g
      if (prev.label !== g.label) return { ...g, processed: false, publish: undefined }
      if (prev.day !== g.day) return { ...g, processed: false, publish: undefined }
      if (prev.files.length !== g.files.length)
        return { ...g, processed: false, publish: undefined }
      for (let i = 0; i < g.files.length; i++) {
        const a = prev.files[i]
        const b = g.files[i]
        if (!a || !b) return { ...g, processed: false, publish: undefined }
        if (
          a.path !== b.path ||
          a.id !== b.id ||
          a.cropStart !== b.cropStart ||
          a.cropEnd !== b.cropEnd ||
          a.mtime !== b.mtime
        )
          return { ...g, processed: false, publish: undefined }
      }
      return g
    })
    setGroups(withDirty)
    submit({ url: '/api/manifest', actionArgs: { intent: 'save-groups', groups: withDirty } })
  }

  return { groups, groupsByDay, setGroups, updateGroups }
}

export { useGroups }
export type { UseGroupsReturn }
