import type { NasSession } from '../../../../packages/skydock-scripts/src/nas'
import {
  lostOnStorage,
  updateMontageIndex
} from '../../../../packages/skydock-scripts/src/montageIndex'
import type { MontageIndex } from '../../../../packages/skydock-scripts/src/montageIndex'
import { messageOf } from '@skydock/scripts'

/* The storage's list of montages changes after the work it describes, and never instead of it: if the
   list cannot be written, the upload or the freeing still stands, and the board says the list did not
   follow. The answer carries the list as it now is, and what the storage no longer holds of it, for
   the board to show. */
const recordOnStorage = async (
  session: NasSession,
  dir: string,
  change: (index: MontageIndex) => void,
  earlier: string[] = []
) => {
  try {
    const index = await updateMontageIndex(session, dir, change, earlier)
    return {
      storage: { dir, tandems: index.tandems, lost: await lostOnStorage(session, index.tandems) }
    }
  } catch (e) {
    return {
      storageProblem: `the storage’s list of montages was not updated: ${messageOf(e)}`
    }
  }
}

export { recordOnStorage }
