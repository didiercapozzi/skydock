import type { ProxyFact } from './boardAnswer'
import type { ManifestFile } from './types'

const ORIGINAL_MISSING = 'The original is not on this machine'

const waitingForProxy = (files: ManifestFile[], facts: Record<string, ProxyFact>) =>
  files.filter((file) => {
    const fact = facts[file.path]
    return fact !== undefined && fact.state === 'none' && !fact.reason
  })

export { ORIGINAL_MISSING, waitingForProxy }
