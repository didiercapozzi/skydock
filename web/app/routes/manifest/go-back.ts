import { restoreBoard, messageOf } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* The board put back as it was at an earlier step (RULES, Going back): its jumps, names and trims.
   What it is now becomes a step of its own first, so this can be undone the same way. */
const goBack: Intent = ({ data, manifestPath, refuse }) => {
  if (!data.step) return refuse('Say which earlier board to go back to.')
  try {
    return { ...boardAnswer(restoreBoard(manifestPath, data.step)), wentBack: true }
  } catch (e) {
    return refuse(messageOf(e))
  }
}

export { goBack }
