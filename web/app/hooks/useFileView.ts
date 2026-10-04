import { z } from 'zod'
import { remembered } from './remembered'

const fileViewSchema = z.enum(['rows', 'grid'])
type FileView = z.infer<typeof fileViewSchema>

const view = remembered<FileView>({
  key: 'skydock.fileView',
  fallback: 'rows',
  kept: 'session',
  from: (stored) => fileViewSchema.safeParse(stored).data ?? null
})

const setFileView = view.set
const useFileView = view.use

export { setFileView, useFileView }
