import { t } from '@lingui/core/macro'
import { useEffect, useRef } from 'react'
import { Icon } from './icons'

/* Every dialog in the app is this shape: a floating sheet with a plain header — the title, a
   quieter line under it and whatever the dialog keeps at hand on the right — a body that scrolls if
   it has to, and a footer on a tinted well with the one button that does the thing on the right. Keeping the shell here is what stops five dialogs from each inventing their own padding. */

/* what Tab can land on inside a dialog */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]'
]
  .map((what) => `${what}:not([tabindex="-1"])`)
  .join(', ')

const Modal = ({
  label,
  title,
  sub,
  aside,
  wide,
  full,
  onClose,
  children,
  footer,
  ...rest
}: {
  label: string
  title: React.ReactNode
  /* a quieter line under the title: what the dialog is about, in figures */
  sub?: React.ReactNode
  /* what sits at the right-hand end of the header, before the close button */
  aside?: React.ReactNode
  wide?: boolean
  /* the whole window, for two things shown side by side: as wide as this many pixels, or the
     window's width when it is narrower; plain `true` takes almost all of a large one */
  full?: boolean | number
  /* clicking the backdrop or pressing Escape closes; a dialog that must not be dismissed that way
     leaves it out */
  onClose?: () => void
  children: React.ReactNode
  footer?: React.ReactNode
} & Record<`data-${string}`, string | undefined>) => {
  const box = useRef<HTMLDivElement>(null)
  /* Focus goes into the dialog and stays there while it is open — Tab past the last button comes
     back to the first, as behind a sheet of glass — and goes back where it was when it closes, so
     the keyboard is never left on something the dialog hid. */
  /* where focus was when the dialog opened, read as it is first drawn — before anything inside it
     takes focus for itself */
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement)
  useEffect(() => {
    const was = opener.current
    if (!box.current?.contains(document.activeElement))
      box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => {
      if (was instanceof HTMLElement && was.isConnected) was.focus()
    }
  }, [])
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) {
      /* the board behind has its own use for Escape */
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !box.current) return
    const all = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const first = all[0]
    const last = all[all.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  return (
    <div
      {...rest}
      onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}
      className='fixed inset-0 z-40 grid place-items-center bg-scrim p-4'>
      <div
        ref={box}
        role='dialog'
        aria-modal='true'
        aria-label={label}
        onKeyDown={keys}
        style={full ? { width: `min(${full === true ? 1360 : full}px, 94vw)` } : undefined}
        className={`flex max-h-full flex-col overflow-hidden rounded-panel bg-pane text-ink shadow-float ${
          full
            ? typeof full === 'number'
              ? 'h-[min(800px,94vh)]'
              : 'h-[92vh]'
            : wide
              ? 'w-[min(680px,100%)]'
              : 'w-[min(560px,100%)]'
        }`}>
        <div className='flex flex-none items-center gap-3.5 border-b border-line-2 px-6.5 pt-5 pb-4'>
          <div className='flex min-w-0 flex-col'>
            <h2 className='font-display m-0 text-heading font-bold tracking-display'>{title}</h2>
            {sub && <span className='font-medium text-ink-3'>{sub}</span>}
          </div>
          <span className='flex-1' />
          {aside}
          {/* Escape and a click beside the dialog already close it; this is the same for the mouse,
              kept out of the keyboard's way and out of what is read out, so the one Close button
              in the footer stays the only one by that name */}
          {onClose && (
            <button
              type='button'
              tabIndex={-1}
              aria-hidden='true'
              title={t`Close (Esc)`}
              onClick={onClose}
              className='grid h-8 w-8 flex-none place-items-center rounded-control text-ink-2 hover:bg-well hover:text-ink'>
              <Icon name='close' />
            </button>
          )}
        </div>
        <div
          className={
            full
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
              : 'flex flex-col gap-3 overflow-auto px-6.5 py-5'
          }>
          {children}
        </div>
        {footer && (
          <div className='flex flex-none items-center gap-3 bg-well px-6.5 py-3.5 [&_button]:h-9.5 [&_button]:gap-2 [&_button]:rounded-control [&_button]:px-4 [&_button]:text-lead'>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* the gap that pushes whatever follows it to the right-hand end of the row */
const Spacer = () => <span className='flex-1' />

const INPUT =
  'rounded-control border border-line-strong bg-pane px-3 py-2 text-body text-ink placeholder:text-ink-3 hover:border-check focus:border-accent focus:outline-2 focus:outline-accent/30 disabled:opacity-50'

const ERROR = 'rounded-control bg-local-soft px-3 py-2 text-body text-local'

/* one line of what a dialog proves, deletes or keeps, marked with what happens to it */
const Line = ({ mark, children }: { mark: string; children: React.ReactNode }) => (
  <li className='flex gap-2 text-body text-ink-2'>
    <span className='w-3 flex-none text-center'>{mark}</span>
    <span>{children}</span>
  </li>
)

/* a dialog's list under its bold heading; a list with no heading leaves the title out */
const Section = ({ title, children }: { title?: React.ReactNode; children: React.ReactNode }) => (
  <>
    {title && <p className='m-0 text-body font-semibold text-ink'>{title}</p>}
    <ul className='m-0 flex list-none flex-col gap-1 p-0'>{children}</ul>
  </>
)

export { ERROR, INPUT, Line, Modal, Section, Spacer }
