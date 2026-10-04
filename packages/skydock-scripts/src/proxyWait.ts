import type { ProxyFact } from './boardAnswer'
import type { ManifestFile } from './types'

const waitingForProxy = (files: ManifestFile[], facts: Record<string, ProxyFact>) =>
  files.filter((file) => {
    const fact = facts[file.path]
    return fact !== undefined && fact.state === 'none' && !fact.reason
  })

export { waitingForProxy }
