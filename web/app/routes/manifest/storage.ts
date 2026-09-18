import type { NasSession } from '../../../../packages/skydock-scripts/src/nas'
import { updateTandemIndex } from '../../../../packages/skydock-scripts/src/tandemIndex'
import type { TandemIndex } from '../../../../packages/skydock-scripts/src/tandemIndex'

/* The storage's list of tandems changes after the work it describes, and never instead of it: if the
   list cannot be written, the upload or the freeing still stands, and the board says the list did not
   follow. The answer carries the list as it now is, for the board to show. */
const recordOnStorage = async (
  session: NasSession,
  dir: string,
  change: (index: TandemIndex) => void
) => {
  try {
    const index = await updateTandemIndex(session, dir, change)
    return { storage: { dir, tandems: index.tandems } }
  } catch (e) {
    return {
      storageProblem: `the storage’s list of tandems was not updated: ${e instanceof Error ? e.message : String(e)}`
    }
  }
}

export { recordOnStorage }
