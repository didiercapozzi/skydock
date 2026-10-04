import { getTrashDir } from '../../../packages/skydock-scripts/src/utils'
import { listBin } from '../../../packages/skydock-scripts/src/bin'

const loader = () => Response.json({ dir: getTrashDir(), batches: listBin() })

export { loader }
