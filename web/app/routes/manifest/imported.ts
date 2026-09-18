import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* files were just added from the computer, one request each: the board looks again, and hears
   how the whole drop went */
const imported: Intent = ({ data, manifest }) => ({
  ...boardAnswer(manifest),
  imported: data.imported
})

export { imported }
