import { t } from '@lingui/core/macro'
import { useState } from 'react'

type Found = { key: string; label: string; where: string; go: () => void }

/* One box across the top that finds anything on the board by a piece of its name — a montage, a
   destination, a file off any camera — and goes to it: Enter goes to the first, a click to any
   (RULES, Finding anything). */
const FindAnything = ({ find }: { find: (query: string) => Found[] }) => {
  const [query, setQuery] = useState('')
  const found = find(query)
  const go = (one: Found | undefined) => {
    if (!one) return
    setQuery('')
    one.go()
  }
  return (
    <div className='relative'>
      <input
        type='search'
        value={query}
        aria-label={t`Find anything`}
        placeholder={t`Find a name, a file…`}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') go(found[0])
          if (e.key === 'Escape') setQuery('')
        }}
        className='w-44 rounded-md border border-line bg-ground px-2 py-[5px] text-[12.5px] text-ink placeholder:text-ink-3 focus:w-60'
      />
      {query.trim().length >= 2 && (
        <ul
          aria-label={t`Found`}
          className='absolute top-full right-0 z-50 m-0 mt-1.5 flex max-h-[60vh] w-[min(340px,calc(100vw-2rem))] list-none flex-col overflow-y-auto rounded-lg border border-line bg-pane p-1 shadow-card'>
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
