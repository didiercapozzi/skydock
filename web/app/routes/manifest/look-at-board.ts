import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* The board looks at its record again, because the record changed under nobody's hand here — another
   tab, a script, a hand edit (RULES, The board). It only reads: nothing is written, and it is no step
   of the history. */
const lookAtBoard: Intent = ({ manifest }) => boardAnswer(manifest)

export { lookAtBoard }
