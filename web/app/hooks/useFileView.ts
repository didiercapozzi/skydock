import { z } from 'zod'
import { remembered } from './remembered'

const fileViewSchema = z.enum(['rows', 'grid'])
type FileView = z.infer<typeof fileViewSchema>

/* How the files are laid out, for this visit rather than for good: a view chosen to look at one
   day's jumps is rarely the view wanted next time the app is opened. */
const view = remembered<FileView>({
  key: 'skydock.fileView',
  fallback: 'rows',
  kept: 'session',
  from: (stored) => fileViewSchema.safeParse(stored).data ?? null
})

const setFileView = view.set
const useFileView = view.use

export { setFileView, useFileView }
