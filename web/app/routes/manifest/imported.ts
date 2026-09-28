import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* files were just added — from the computer, one request each, or off a camera as each lands: the
   board looks again, and hears how a drop went when there is a drop to hear about */
const imported: Intent = ({ data, manifest }) => ({
  ...boardAnswer(manifest),
  imported: data.imported
})

export { imported }
