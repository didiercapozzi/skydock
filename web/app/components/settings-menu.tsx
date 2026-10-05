import { t } from '@lingui/core/macro'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'

const TOOL =
  'inline-flex h-[34px] items-center gap-2 rounded-[10px] border-0 px-[11px] text-[13.5px] font-semibold text-ink hover:bg-well disabled:opacity-40'

const Menu = ({
  label,
  icon,
  round = false,
  lead,
  side = 'right',
  children
}: {
  label: string
  icon?: IconName
  round?: boolean
  lead?: IconName
  side?: 'left' | 'right'
  children: (close: () => void) => React.ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const holder = useRef<HTMLDivElement | null>(null)
  const close = () => setOpen(false)
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
              ? `inline-flex size-[42px] items-center justify-center rounded-full border-0 shadow-card hover:bg-accent-soft ${open ? 'bg-accent-soft' : 'bg-pane'}`
              : `${TOOL} w-[34px] justify-center px-0 ${open ? 'bg-well' : ''}`
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
          className='inline-flex h-[30px] w-full items-center justify-center gap-1.5 rounded-full bg-pane px-3 text-[12.5px] font-bold text-accent-ink shadow-card hover:bg-accent-soft'>
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

const SettingsMenu = ({ children }: { children: (close: () => void) => React.ReactNode }) => (
  <Menu
    label={t`Settings`}
    icon='settings'>
    {children}
  </Menu>
)

const SettingsRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className='flex items-center justify-between gap-3 text-[12.5px] font-semibold text-ink-2'>
    <span>{label}</span>
    {children}
  </div>
)

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
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) => (
  <button
    type='button'
    title={title}
    onClick={onClick}
    disabled={disabled}
    className={`flex w-full items-center gap-2 rounded-[9px] border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] font-semibold hover:bg-well disabled:cursor-default disabled:opacity-40 ${danger ? 'text-bin' : 'text-ink'}`}>
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
