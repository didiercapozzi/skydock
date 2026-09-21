import { boardViewSchema } from '../helpers/view'

/* A folder of the board, by its address: /dropzone/yverdon, /passenger/Lily%20DONZALLAZ, /storage.
   The board itself is the layout around this and draws the whole screen from what the address says,
   so there is nothing to draw here — this is the address, and the shape of what an address may
   carry beside the folder: which kind of file is shown, what is being looked for, how the files are
   grouped, which jump card is open. */
const searchParamsArgs = boardViewSchema

const Place = () => null

export { searchParamsArgs }
export default Place
