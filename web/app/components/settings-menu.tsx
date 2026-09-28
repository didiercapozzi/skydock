import { t } from '@lingui/core/macro'
import { useEffect, useRef, useState } from 'react'

/* A button that opens a small panel of choices under it. It closes on Escape, on a click outside
   it, and once something in it is chosen. */
const Menu = ({
  label,
  mark,
  side = 'right',
  children
}: {
  label: string
  mark?: string
  /* which edge of the button the panel lines up with */
  side?: 'left' | 'right'
  children: (close: () => void) => React.ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const holder = useRef<HTMLDivElement | null>(null)
  const close = () => setOpen(false)
  /* a click anywhere else, or Escape, closes it: listening to the page is what an effect is for */
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (holder.current && e.target instanceof Node && !holder.current.contains(e.target))
        setOpen(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <div
      ref={holder}
      className='relative'>
      <button
        type='button'
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className='inline-flex items-center gap-1.5 rounded-md border border-line bg-pane px-[11px] py-[5px] text-[12.5px] font-medium hover:border-ink-3'>
        {mark && <span aria-hidden='true'>{mark}</span>}
        {label}
      </button>
      {open && (
        <div
          role='group'
          aria-label={label}
          className={`absolute top-full z-50 mt-1.5 flex max-h-[60vh] w-max max-w-[min(300px,calc(100vw-2rem))] min-w-[200px] flex-col gap-3 overflow-y-auto rounded-lg border border-line bg-pane p-3 shadow-card ${
            side === 'right' ? 'right-0' : 'left-0'
          }`}>
          {children(close)}
        </div>
      )}
    </div>
  )
}

/* What is set once and then left alone — how the board looks, the language it speaks, where it keeps
   its work, the editing templates, its history, the keys it knows — gathered behind one button, so
   the top of the board keeps only what is used every day (RULES, The board). */
const SettingsMenu = ({ children }: { children: (close: () => void) => React.ReactNode }) => (
  <Menu
    label={t`Settings`}
    mark='⚙'>
    {children}
  </Menu>
)

/* one line of the menu: what it is, and the control for it */
const SettingsRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className='flex items-center justify-between gap-3 text-[12.5px] text-ink-2'>
    <span>{label}</span>
    {children}
  </div>
)

/* one choice in a menu */
const MenuItem = ({
  children,
  title,
  onClick
}: {
  children: React.ReactNode
  title?: string
  onClick: () => void
}) => (
  <button
    type='button'
    title={title}
    onClick={onClick}
    className='w-full rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-line-2'>
    {children}
  </button>
)

export { Menu, MenuItem, SettingsMenu, SettingsRow }
