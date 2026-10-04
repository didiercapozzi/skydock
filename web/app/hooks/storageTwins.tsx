import { createContext, useContext } from 'react'
import type { StorageFile } from '../../../packages/skydock-scripts/src/storageEntry'

type StorageTwins = {
  byName: Map<string, StorageFile>
  dsmHost: string | null
}

const StorageTwinsContext = createContext<StorageTwins | null>(null)

const useStorageTwin = (name: string | null) => {
  const twins = useContext(StorageTwinsContext)
  const file = name && twins ? twins.byName.get(name) : undefined
  return file && twins ? { file, dsmHost: twins.dsmHost } : null
}

export { StorageTwinsContext, useStorageTwin }
