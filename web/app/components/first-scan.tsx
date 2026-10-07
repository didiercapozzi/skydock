import { t } from '@lingui/core/macro'
import { useEffect, useRef } from 'react'
import { Notice } from './notice'
import { WindowBar } from './window-bar'

/* A work folder with no record yet (RULES, The first time): the board does not wait to be asked. It looks
   through the folder at once and shows only that it is doing so; the board itself is what comes next. When
   the look fails, what went wrong is said and the look can be asked for again. */
const FirstScan = ({
  scanning,
  onScan,
  note,
  problem,
  onClose,
  onOpen
}: {
  scanning: boolean
  onScan: () => void
  note: string | null
  problem: boolean
  onClose: () => void
  onOpen?: () => void
}) => {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    onScan()
  }, [onScan])
  return (
    <div className='ground flex h-screen flex-col overflow-hidden'>
      <WindowBar />
      <main className='mx-2.5 mb-2.5 grid flex-1 place-items-center overflow-auto rounded-corner bg-pane p-6 shadow-card'>
        <div className='flex max-w-115 flex-col items-center gap-4 text-center'>
          {scanning || !note ? (
            <>
              <span
                role='status'
                aria-label={t`Scanning…`}
                className='size-12 animate-spin rounded-full border-5 border-line-strong border-t-accent'
              />
              <h1 className='m-0 font-display text-heading font-bold tracking-display'>
                {t`Scanning…`}
              </h1>
            </>
          ) : (
            <>
              <h1 className='m-0 font-display text-heading font-bold tracking-display'>
                {t`The work folder could not be looked through`}
              </h1>
              <Notice
                problem={problem}
                onClose={onClose}
                onOpen={onOpen}
                className='rounded-corner border px-2.5 py-1.75 text-left'>
                {note}
              </Notice>
              <button
                type='button'
                onClick={onScan}
                className='rounded-corner border border-accent bg-accent px-2.75 py-1.25 text-body font-medium text-white'>
                {t`Scan`}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export { FirstScan }
