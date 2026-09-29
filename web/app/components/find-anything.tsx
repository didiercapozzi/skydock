import { t } from '@lingui/core/macro'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'

type Found = { key: string; label: string; where: string; go: () => void }

/* One box across the top that finds anything on the board by a piece of its name — a montage, a
   destination, a file off any camera — and goes to it: Enter goes to the first, a click to any
   (RULES, Finding anything). */
const FindAnything = ({ find }: { find: (query: string) => Found[] }) => {
  const [query, setQuery] = useState('')
  /* looked for once typing pauses, not at every key: the whole board is gone through each time */
  const [asked, setAsked] = useState('')
  const typed = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ask = (next: string) => {
    setQuery(next)
    if (typed.current) clearTimeout(typed.current)
    typed.current = setTimeout(() => setAsked(next), next.trim().length < 2 ? 0 : 120)
  }
  const found = asked.trim().length >= 2 ? find(asked) : []
  /* Ctrl or ⌘ with F goes to the box from anywhere on the board, as it does in any tool */
  const box = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f') return
      e.preventDefault()
      box.current?.focus()
      box.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const go = (one: Found | undefined) => {
    if (!one) return
    ask('')
    one.go()
  }
  return (
    <div className='relative'>
      <label className='flex h-7 w-[280px] items-center gap-[7px] rounded-[5px] border border-line-strong bg-pane pr-1 pl-2 text-ink-3'>
        <Icon
          name='search'
          size={14}
          weight={2.2}
        />
        <input
          ref={box}
          type='search'
          value={query}
          aria-label={t`Find anything`}
          placeholder={t`Find anything`}
          onChange={(e) => ask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(found[0] ?? find(query)[0])
            if (e.key === 'Escape') ask('')
          }}
          className='min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3'
        />
        <kbd className='rounded-[3px] border border-line bg-rail px-1 font-sans text-[10.5px] leading-4 font-medium text-ink-3'>
          Ctrl F
        </kbd>
      </label>
      {asked.trim().length >= 2 && query.trim().length >= 2 && (
        <ul
          aria-label={t`Found`}
          className='absolute top-full right-0 z-50 m-0 mt-1.5 flex max-h-[60vh] w-[min(340px,calc(100vw-2rem))] list-none flex-col overflow-y-auto rounded-md bg-pane p-1 shadow-float'>
          {found.length === 0 ? (
            <li className='px-2 py-1.5 text-[12.5px] text-ink-3'>{t`Nothing by that name`}</li>
          ) : (
            found.map((one) => (
              <li key={one.key}>
                <button
                  type='button'
                  onClick={() => go(one)}
                  className='flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-line-2'>
                  <span className='min-w-0 flex-1 truncate text-ink'>{one.label}</span>
                  <span className='flex-none text-[11px] text-ink-3'>{one.where}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

export { FindAnything }
export type { Found }
