import { getTrashDir } from '../../../packages/skydock-scripts/src/utils'
import { listBin } from '../../../packages/skydock-scripts/src/bin'

/* What the bin holds, to be looked through and brought back from — never emptied from here (RULES,
   Putting files in the bin). */
const loader = () => Response.json({ dir: getTrashDir(), batches: listBin() })

export { loader }
