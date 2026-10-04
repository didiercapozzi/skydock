import { z } from 'zod'
import { remembered } from './remembered'

const themeSchema = z.enum(['auto', 'light', 'dark'])
type Theme = z.infer<typeof themeSchema>

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
