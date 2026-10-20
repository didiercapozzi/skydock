import { cancelRendering } from '../../../../packages/skydock-scripts/src/filmRender'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

const cancelRender: Intent = async ({ data, refuse, latest }) => {
  if (!cancelRendering(data.groupId)) return refuse('Nothing is being rendered.')
  return { ...(await boardAnswer(await latest())), renderCancelled: true }
}

export { cancelRender }
