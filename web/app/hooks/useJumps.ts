import { useState } from 'react'
import type { Destination, ManifestFile, ManifestGroup } from '../components/types'
import { useSafeFetcher } from '../helpers/routing'

const useGroups = (initialGroups: ManifestGroup[]) => {
  const [groups, setGroups] = useState<ManifestGroup[]>(initialGroups)
  const { submit, state } = useSafeFetcher()
  /* how many times the jumps were edited here: an answer to a request sent before the last of them is of
     the record as it was before it */
  const [edits, setEdits] = useState(0)

  /* `destinations` rides along when an edit also adds a place. Saved separately, the place's answer
     would carry the groups as they were before and the board could take it over the edit it had just
     shown — a jump filed under a new place springing back into Fresh files. One save,
     carrying both, has nothing to race. */
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
    setEdits((n) => n + 1)
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

  /* `saving`: a save is on its way, and an answer about the record taken meanwhile would be of what it was before */
  return { groups, setGroups, updateGroups, edits, saving: state !== 'idle' }
}

export { useGroups }
