import { z } from 'zod'

/* How a folder is being looked at, which belongs in its address: the kind of file shown, what was
   typed in the search box, how the files are grouped, and which jump card is open. Kept in the
   address rather than in the board's memory, so a folder opened again — reloaded, gone back to,
   sent to somebody — comes back looking the way it was left, and nothing here has to be remembered
   for a board that is no longer on screen.

   Everything is optional, because an address with nothing in it is the plain folder: the board
   fills in what each family of folder does by default. */
const boardViewSchema = z.object({
  /* videos, photos or both */
  kind: z.enum(['all', 'video', 'photo']).optional(),
  /* what is typed in the search box */
  find: z.string().optional(),
  /* by jump, by day, or one list — what the folder offers is the board's business */
  by: z.enum(['jump', 'day', 'none']).optional(),
  /* which jump card is open, by its own key */
  card: z.string().optional(),
  /* this address is a file open in a window of its own, with nothing of the board around it */
  window: z.literal('preview').optional()
})

type BoardView = z.infer<typeof boardViewSchema>

export { boardViewSchema }
export type { BoardView }
