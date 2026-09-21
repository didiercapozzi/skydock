import { boardViewSchema } from '../helpers/view'

/* One file, open in the folder it belongs to: /dropzone/yverdon/file/<the file>. The board is the
   layout around this and draws the preview from what the address says, so there is nothing to draw
   here — this is the address, which is what makes an open clip something to reload, to come back
   from, or to send to somebody. It carries how the folder behind it is being looked at, as the
   folder's own address does, so closing the clip leaves that folder as it was.  */
const searchParamsArgs = boardViewSchema

const PreviewedFile = () => null

export { searchParamsArgs }
export default PreviewedFile
