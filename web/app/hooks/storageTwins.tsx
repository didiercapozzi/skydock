import { createContext, useContext } from 'react'
import type { StorageFile } from '../../../packages/skydock-scripts/src/storageEntry'

/* What the storage holds of the files shown on a place's page, by the name each was delivered under:
   a file here that is up there too says so on its own row, and can be shown in the storage's own web
   interface. Absent where a page has no folder on the storage to compare. */
type StorageTwins = {
  byName: Map<string, StorageFile>
  /* the storage's own address, for the link into its web interface */
  dsmHost: string | null
}

const StorageTwinsContext = createContext<StorageTwins | null>(null)

/* the copy on the storage of a file shown here, named as it was delivered — or none */
const useStorageTwin = (name: string | null) => {
  const twins = useContext(StorageTwinsContext)
  const file = name && twins ? twins.byName.get(name) : undefined
  return file && twins ? { file, dsmHost: twins.dsmHost } : null
}

export { StorageTwinsContext, useStorageTwin }
export type { StorageTwins }
