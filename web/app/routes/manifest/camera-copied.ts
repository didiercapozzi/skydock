import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* A camera plugged in has been copied off and scanned on the machine: the board looks again, and
   hears what came off (RULES, The workflow). */
const cameraCopied: Intent = ({ data, manifest }) => ({
  ...boardAnswer(manifest),
  cameraCopied: data.cameraCopied
})

export { cameraCopied }
