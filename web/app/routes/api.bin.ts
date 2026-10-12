import { getTrashDir } from '../../../packages/skydock-scripts/src/utils'
import { listBin } from '../../../packages/skydock-scripts/src/bin'

const loader = async () => Response.json({ dir: getTrashDir(), batches: await listBin() })

export { loader }
