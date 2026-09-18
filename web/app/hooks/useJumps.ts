import { useState } from 'react'
import type { Destination, ManifestFile, ManifestGroup } from '../components/types'
import { useSafeFetcher } from '../helpers/routing'

const useGroups = (initialGroups: ManifestGroup[]) => {
  const [groups, setGroups] = useState<ManifestGroup[]>(initialGroups)
  const { submit } = useSafeFetcher()

  /* `destinations` rides along when an edit also adds a place. Saving the place separately raced
     this save: its answer carried the groups as they were before, and the board took that answer
     over the edit it had just shown — a jump filed under Tandems for the first time sprang straight
     back into Unsorted. One save, carrying both, has nothing to race. */
  const updateGroups = (
    next: ManifestGroup[],
    fileUpdates?: ManifestFile[],
    destinations?: Destination[]
  ) => {
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
    submit({
      url: '/api/manifest',
      actionArgs: {
        intent: 'save-groups',
        groups: withDirty,
        ...(fileUpdates ? { fileUpdates } : {}),
        ...(destinations ? { destinations } : {})
      }
    })
  }

  return { groups, setGroups, updateGroups }
}

export { useGroups }
