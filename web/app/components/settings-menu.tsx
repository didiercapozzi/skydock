import { t } from '@lingui/core/macro'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'

/* a tool on the toolbar: no frame until the pointer is over it */
const TOOL =
  'inline-flex h-[34px] items-center gap-2 rounded-[10px] border-0 px-[11px] text-[13.5px] font-semibold text-ink hover:bg-well disabled:opacity-40'

/* A button that opens a small panel of choices under it. It closes on Escape, on a click outside
   it, and once something in it is chosen. */
const Menu = ({
  label,
  icon,
  lead,
  side = 'right',
  children
}: {
  label: string
  /* drawn as this mark alone, the label its name, as a tool on the toolbar is */
  icon?: IconName
  /* a mark before the label, on a button that shows its label */
  lead?: IconName
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
      {icon ? (
        <button
          type='button'
          aria-expanded={open}
          aria-label={label}
          title={label}
          onClick={() => setOpen(!open)}
          className={`${TOOL} w-[34px] justify-center px-0 ${open ? 'bg-well' : ''}`}>
          <Icon
            name={icon}
            className='text-ink-2'
          />
        </button>
      ) : (
        <button
          type='button'
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className='inline-flex h-[30px] w-full items-center justify-center gap-1.5 rounded-[10px] bg-well px-3 text-[12.5px] font-bold hover:bg-line'>
          {lead && (
            <Icon
              name={lead}
              size={14}
              className='text-ink-2'
            />
          )}
          {label}
        </button>
      )}
      {open && (
        <div
          role='group'
          aria-label={label}
          className={`absolute top-full z-50 mt-1.5 flex max-h-[60vh] w-max max-w-[min(300px,calc(100vw-2rem))] min-w-[200px] flex-col gap-3 overflow-y-auto rounded-[16px] bg-pane p-3.5 shadow-float ${
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
    icon='settings'>
    {children}
  </Menu>
)

/* one line of the menu: what it is, and the control for it */
const SettingsRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className='flex items-center justify-between gap-3 text-[12.5px] font-semibold text-ink-2'>
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
    className='w-full rounded-[9px] border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-ink hover:bg-well'>
    {children}
  </button>
)

export { Menu, MenuItem, SettingsMenu, SettingsRow, TOOL }
