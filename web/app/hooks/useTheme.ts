import { z } from 'zod'
import { remembered } from './remembered'

/* Auto follows the machine; the other two say so regardless of it. Auto is the default because
   most of the time the machine is right — but it is an ambient signal the app cannot see and the
   reader cannot check, which is exactly why overriding it has to be possible. */
const themeSchema = z.enum(['auto', 'light', 'dark'])
type Theme = z.infer<typeof themeSchema>

/* The attribute is what the stylesheet reads; `auto` removes it so the media query decides again.
   The same line runs before first paint from a script in the document head, so the page never
   appears in one theme and then changes to the other. */
const applyTheme = (theme: Theme) => {
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

const theme = remembered<Theme>({
  key: 'skydock.theme',
  fallback: 'auto',
  from: (stored) => themeSchema.safeParse(stored).data ?? null,
  then: applyTheme
})

const setTheme = theme.set
const useTheme = theme.use

export { setTheme, useTheme }
export type { Theme }
