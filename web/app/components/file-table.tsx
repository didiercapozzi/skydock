import { Icon } from './icons'

/* A list of files as the board draws every table: a quiet header on the rail, rows of an even
   height divided by a hairline. Shared with the bin, which is the same kind of list. */
const TH =
  'px-3 py-2 text-left text-[11px] font-bold tracking-[0.07em] whitespace-nowrap text-ink-3 uppercase'
const TD =
  'h-[52px] border-t border-line-2 px-3 font-semibold whitespace-nowrap first:rounded-l-[13px] last:rounded-r-[13px]'

/* a file's box, drawn the way the board's own lists draw it and still a checkbox to whoever reads
   the page out */
const Tick = ({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: () => void
}) => (
  <span className='relative grid size-[18px] place-items-center'>
    <input
      type='checkbox'
      aria-label={label}
      checked={checked}
      onChange={onChange}
      className='peer m-0 size-[18px] cursor-pointer appearance-none rounded-[6px] border-2 border-check bg-pane checked:border-accent checked:bg-accent hover:border-accent'
    />
    <Icon
      name='check'
      size={11}
      weight={3.5}
      className='pointer-events-none absolute text-white opacity-0 peer-checked:opacity-100'
    />
  </span>
)

export { TD, TH, Tick }
