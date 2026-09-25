import type { ProxyFact } from './boardAnswer'
import type { ManifestFile } from './types'

/* The clips still waiting for their proxy: not made yet, and not failed either. A clip with no
   proxy to wait for — a photo, a clip that is its own proxy, one with no fact at all — is not
   waiting, and neither is one whose proxy was tried and could not be made: that one is settled,
   and the editor opens it as it is.

   The montage waits on these (RULES, Montage). The editor opens on proxies, and a montage made
   before them opens on the full clips, which is the slowest way there is to edit. */
const waitingForProxy = (files: ManifestFile[], facts: Record<string, ProxyFact>) =>
  files.filter((file) => {
    const fact = facts[file.path]
    return fact !== undefined && fact.state === 'none' && !fact.reason
  })

export { waitingForProxy }
