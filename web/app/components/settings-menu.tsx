import { t } from '@lingui/core/macro'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'

/* a tool on the toolbar: no frame until the pointer is over it */
const TOOL =
  'inline-flex h-control items-center gap-2 rounded-control border-0 px-2.75 text-lead font-semibold text-ink hover:bg-well disabled:opacity-40'

/* A button that opens a small panel of choices under it. It closes on Escape, on a click outside
   it, and once something in it is chosen. */
const Menu = ({
  label,
  icon,
  round = false,
  lead,
  side = 'right',
  children
}: {
  label: string
  /* drawn as this mark alone, the label its name, as a tool on the toolbar is */
  icon?: IconName
  /* a round white button of its own rather than a tool of the toolbar, for the head of a page */
  round?: boolean
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
          className={
            round
              ? `inline-flex size-control-lg items-center justify-center rounded-full border-0 shadow-card hover:bg-accent-soft ${open ? 'bg-accent-soft' : 'bg-pane'}`
              : `${TOOL} w-control justify-center px-0 ${open ? 'bg-well' : ''}`
          }>
          <Icon
            name={icon}
            className={round ? 'text-accent' : 'text-ink-2'}
          />
        </button>
      ) : (
        <button
          type='button'
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className='inline-flex h-control-sm w-full items-center justify-center gap-1.5 rounded-full bg-pane px-3 text-body font-bold text-accent-ink shadow-card hover:bg-accent-soft'>
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
          className={`absolute top-full z-50 mt-1.5 flex max-h-[60vh] w-max max-w-[min(300px,calc(100vw-2rem))] min-w-50 flex-col gap-3 overflow-y-auto rounded-card bg-pane p-3.5 shadow-float ${
            side === 'right' ? 'right-0' : 'left-0'
          }`}>
          {children(close)}
        </div>
      )}
    </div>
  )
}

/* What is set once and then left alone — how the board looks, the language it speaks, where it keeps
   its work, the editing templates, the keys it knows — gathered behind one button, so
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
  <div className='flex items-center justify-between gap-3 text-body font-semibold text-ink-2'>
    <span>{label}</span>
    {children}
  </div>
)

/* one choice in a menu, with a small mark before it in the colour of the words, when it has one */
const MenuItem = ({
  children,
  title,
  icon,
  danger,
  disabled,
  onClick
}: {
  children: React.ReactNode
  title?: string
  icon?: IconName
  /* what it does is not undone by pressing it again: drawn in the colour of a warning */
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) => (
  <button
    type='button'
    title={title}
    onClick={onClick}
    disabled={disabled}
    className={`flex w-full items-center gap-2 rounded-control border-0 bg-transparent px-2.5 py-1.5 text-left text-body font-semibold hover:bg-well disabled:cursor-default disabled:opacity-40 ${danger ? 'text-bin' : 'text-ink'}`}>
    {icon && (
      <Icon
        name={icon}
        size={14}
        className='text-ink-3'
      />
    )}
    {children}
  </button>
)

export { Menu, MenuItem, SettingsMenu, SettingsRow, TOOL }
