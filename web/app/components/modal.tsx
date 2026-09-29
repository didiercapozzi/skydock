import { t } from '@lingui/core/macro'
import { useEffect, useRef } from 'react'
import { Icon } from './icons'

/* Every dialog in the app is this shape: a header bar in the window's own chrome with the title, a
   quieter line under it and whatever the dialog keeps at hand on the right; a body that scrolls if
   it has to; and a footer bar in the same chrome with the one button that does the thing on the
   right. Keeping the shell here is what stops five dialogs from each inventing their own padding. */

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
  /* the whole window, for two things shown side by side */
  full?: boolean
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
      className='fixed inset-0 z-40 grid place-items-center bg-[rgba(24,24,27,0.4)] p-4'>
      <div
        ref={box}
        role='dialog'
        aria-modal='true'
        aria-label={label}
        onKeyDown={keys}
        className={`flex max-h-full flex-col overflow-hidden rounded-lg bg-pane text-ink shadow-float ${
          full
            ? 'h-[92vh] w-[min(1360px,94vw)]'
            : wide
              ? 'w-[min(680px,100%)]'
              : 'w-[min(560px,100%)]'
        }`}>
        <div className='flex flex-none items-center gap-2 border-b border-line-strong bg-chrome px-3.5 py-2.5'>
          <div className='flex min-w-0 flex-col gap-1'>
            <h2 className='m-0 text-[14px] leading-[1.3] font-semibold tracking-[-0.015em]'>
              {title}
            </h2>
            {sub && <span className='text-[12px] text-ink-3'>{sub}</span>}
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
              className='grid h-7 w-7 flex-none place-items-center rounded-[5px] text-ink-2 hover:bg-well hover:text-ink'>
              <Icon name='close' />
            </button>
          )}
        </div>
        <div
          className={
            full
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
              : 'flex flex-col gap-2.5 overflow-auto px-4 py-3.5'
          }>
          {children}
        </div>
        {footer && (
          <div className='flex flex-none items-center gap-2 border-t border-line-strong bg-chrome px-3.5 py-2.5'>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* the gap that pushes whatever follows it to the right-hand end of the row */
const Spacer = () => <span className='flex-1' />

/* A labelled field, stacked, quiet label over a loud value — the same in every dialog. */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className='flex flex-col gap-1 text-[12px] text-ink-2'>
    {label}
    {children}
  </label>
)

const INPUT =
  'rounded-md border border-line bg-pane px-2.5 py-[5px] text-[13px] text-ink placeholder:text-ink-3 disabled:opacity-50'

const ERROR = 'rounded-md bg-local-soft px-2.5 py-[7px] text-[12.5px] text-local'

/* one line of what a dialog proves, deletes or keeps, marked with what happens to it */
const Line = ({ mark, children }: { mark: string; children: React.ReactNode }) => (
  <li className='flex gap-2 text-[12.5px] text-ink-2'>
    <span className='w-3 flex-none text-center'>{mark}</span>
    <span>{children}</span>
  </li>
)

export { ERROR, Field, INPUT, Line, Modal, Spacer }
