/* The board has three buttons. `Go` is the one thing a panel is asking to be done next, and there is
   never more than one of it in view; `Mini` is everything else — small, quiet, and at the right-hand
   end of the line it belongs to; `ToBin` is putting files in the bin, always red and always with its
   icon, so the one way off the board is never mistaken for another (RULES, The board). Keeping them
   here is what stops a fourth from being invented inline. */

type Props = {
  children: React.ReactNode
  title?: string
  disabled?: boolean
  /* a dialog's confirming button sits outside the form element it submits, so it says which one */
  type?: 'button' | 'submit'
  form?: string
  onClick?: () => void
  /* one of a run of choices, and the one that is on */
  pressed?: boolean
}

const Go = ({ children, title, disabled, type = 'button', form, onClick }: Props) => (
  <button
    type={type}
    form={form}
    title={title}
    disabled={disabled}
    onClick={onClick}
    className='rounded-[5px] border border-accent bg-accent px-3 py-1 text-[12px] font-semibold text-white hover:brightness-110 disabled:cursor-default disabled:opacity-45'>
    {children}
  </button>
)

const Mini = ({ children, title, disabled, type = 'button', form, onClick, pressed }: Props) => (
  <button
    type={type}
    form={form}
    title={title}
    disabled={disabled}
    onClick={onClick}
    aria-pressed={pressed}
    className={`rounded-[5px] border px-2 py-[3px] text-[11.5px] disabled:cursor-default disabled:opacity-40 ${
      pressed
        ? 'border-accent bg-accent-soft font-semibold text-ink'
        : 'border-line bg-pane text-ink-2 hover:border-ink-3 hover:text-ink'
    }`}>
    {children}
  </button>
)

/* a bin, drawn in the colour of the text beside it */
const BinIcon = () => (
  <svg
    aria-hidden='true'
    viewBox='0 0 16 16'
    className='h-[13px] w-[13px] flex-none'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.5'
    strokeLinecap='round'
    strokeLinejoin='round'>
    <path d='M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v5M9.2 6.5v5' />
  </svg>
)

/* Putting files in the bin, at the size of the buttons around it: a `Mini` in a panel, a `Go` at the
   foot of a dialog. */
const ToBin = ({
  children,
  title,
  disabled,
  onClick,
  size = 'mini'
}: Omit<Props, 'type' | 'form' | 'pressed'> & { size?: 'mini' | 'go' }) => (
  <button
    type='button'
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-[5px] border border-bin bg-bin text-white hover:brightness-110 disabled:cursor-default disabled:opacity-45 ${
      size === 'go' ? 'px-3 py-1 text-[12px] font-semibold' : 'px-2 py-[3px] text-[11.5px]'
    }`}>
    <BinIcon />
    {children}
  </button>
)

/* A run of choices where exactly one is on: rows or thumbnails, auto or light or dark. The pressed
   one is filled rather than merely darker, because which one is on has to be readable at a glance
   in either theme.

   Each option is what it is called and, where there is one, the mark that stands for it: the name
   is what it is called to anyone reading the page out and what it says when hovered, and the mark
   is all the room it takes. Eight words across the top for two settings is a header somebody has to
   read before they can use it. */
const Seg = <T extends string>({
  label,
  value,
  options,
  onPick
}: {
  label: string
  value: T
  options: readonly (readonly [T, string] | readonly [T, string, string])[]
  onPick: (value: T) => void
}) => (
  <span
    role='group'
    aria-label={label}
    className='flex overflow-hidden rounded-md border border-line'>
    {options.map(([option, name, mark]) => (
      <button
        key={option}
        type='button'
        aria-pressed={value === option}
        aria-label={mark ? name : undefined}
        title={mark ? name : undefined}
        onClick={() => onPick(option)}
        className={`py-[5px] text-[12px] ${mark ? 'w-8 text-center' : 'px-[11px]'} ${
          value === option ? 'bg-accent-soft font-semibold text-accent' : 'bg-pane text-ink-2'
        }`}>
        {mark ?? name}
      </button>
    ))}
  </span>
)

export { Go, Mini, Seg, ToBin }
