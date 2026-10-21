import { t } from '@lingui/core/macro'
import { z } from 'zod'

const FILM_ACTIONS = [
  'cut',
  'fade',
  'ripple',
  'snap',
  'title',
  'delete',
  'marker',
  'previous',
  'next'
] as const
type FilmAction = (typeof FILM_ACTIONS)[number]
type FilmKeys = Record<FilmAction, string[]>

const DEFAULT_KEYS: FilmKeys = {
  cut: ['c'],
  fade: ['f'],
  ripple: ['r'],
  snap: ['s'],
  title: ['t'],
  delete: ['d', 'Delete', 'Backspace'],
  marker: ['m'],
  previous: ['q'],
  next: ['e']
}

const refusedKey = (key: string) => {
  if (key === 'Delete' || key === 'Backspace') return null
  if (key === 'Enter' || key === ' ') return t`Enter and Space play and stop`
  if (key === 'Escape') return t`Esc closes the dialogs`
  if (key === 'Tab') return t`Tab moves between the controls`
  if (key === '?') return t`? opens the list of shortcuts`
  if (/^(Arrow\w+|Home|End)$/.test(key)) return t`The arrows, Home and End move the playhead`
  if (key.length !== 1) return t`This key cannot be used here`
  return null
}

const keyName = (key: string) => (key.length === 1 ? key.toLowerCase() : key)

const keyNames = ({ key, code }: { key: string; code: string }) => [
  keyName(key),
  ...(/^\p{L}$/u.test(key) && !/^[a-z]$/i.test(key) && /^Key[A-Z]$/.test(code)
    ? [code.slice(3).toLowerCase()]
    : [])
]

const keyLabel = (key: string) => (key.length === 1 ? key.toUpperCase() : key)

const keyOwner = (keys: FilmKeys, key: string) =>
  FILM_ACTIONS.find((action) => keys[action].includes(key)) ?? null

const withoutKey = (keys: FilmKeys, action: FilmAction, key: string): FilmKeys => ({
  ...keys,
  [action]: keys[action].filter((one) => one !== key)
})

const moveKey = (keys: FilmKeys, action: FilmAction, key: string): FilmKeys => {
  const owner = keyOwner(keys, key)
  const freed = owner ? withoutKey(keys, owner, key) : keys
  return { ...freed, [action]: [...freed[action].filter((one) => one !== key), key] }
}

const storedKey = z
  .string()
  .transform(keyName)
  .refine((key) => refusedKey(key) === null)

const storedKeys = z.array(z.unknown()).max(8)

const parseKeys = (stored: string): FilmKeys => {
  let raw: unknown
  try {
    raw = JSON.parse(stored)
  } catch {
    raw = null
  }
  const given = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const seen = new Set<string>()
  const parsed = {} as FilmKeys
  for (const action of FILM_ACTIONS) {
    const read = storedKeys.safeParse(given[action])
    const kept = read.success
      ? read.data.flatMap((one) => {
          const key = storedKey.safeParse(one)
          return key.success ? [key.data] : []
        })
      : DEFAULT_KEYS[action]
    parsed[action] = kept.filter((key) => !seen.has(key) && seen.add(key))
  }
  return parsed
}

export {
  DEFAULT_KEYS,
  FILM_ACTIONS,
  keyLabel,
  keyName,
  keyNames,
  keyOwner,
  moveKey,
  parseKeys,
  refusedKey,
  withoutKey
}
export type { FilmAction, FilmKeys }
