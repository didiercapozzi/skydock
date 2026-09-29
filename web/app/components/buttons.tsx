/* The board has four buttons. `Go` is the one thing a panel is asking to be done next, and there is
   never more than one of it in view; `Mini` is everything else — small, quiet, and at the right-hand
   end of the line it belongs to; `ToBin` is putting files in the bin, always red and always with its
   icon, so the one way off the board is never mistaken for another; `Danger` says it in red on a
   plain button, for what deletes or lets go of something that is not going to the bin (RULES, The
   board). Keeping them
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
    className='inline-flex h-[30px] items-center justify-center gap-1.5 rounded-[5px] border border-accent bg-accent px-[11px] text-[12.5px] font-medium whitespace-nowrap text-white hover:brightness-110 disabled:cursor-default disabled:opacity-45'>
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
    className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-[5px] border px-[9px] text-[12.5px] font-medium whitespace-nowrap shadow-card disabled:cursor-default disabled:opacity-40 ${
      pressed
        ? 'border-accent bg-accent-soft text-accent-ink'
        : 'border-line-strong bg-pane text-ink hover:bg-well'
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

/* Red, at the size of the buttons around it: a `Mini` in a panel, a `Go` at the foot of a dialog. */
const Danger = ({
  children,
  title,
  disabled,
  onClick,
  size = 'go'
}: Omit<Props, 'type' | 'form' | 'pressed'> & { size?: 'mini' | 'go' }) => (
  <button
    type='button'
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={`inline-flex items-center justify-center gap-1.5 rounded-[5px] border border-line-strong bg-pane font-medium whitespace-nowrap text-bin shadow-card hover:bg-bin-soft disabled:cursor-default disabled:opacity-45 ${
      size === 'go' ? 'h-[30px] px-[11px] text-[12.5px]' : 'h-7 px-[9px] text-[12.5px]'
    }`}>
    {children}
  </button>
)

/* Putting files in the bin: red, and with its icon. */
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
    className={`inline-flex items-center justify-center gap-1.5 rounded-[5px] border border-bin bg-bin font-medium whitespace-nowrap text-white hover:brightness-110 disabled:cursor-default disabled:opacity-45 ${
      size === 'go' ? 'h-[30px] px-[11px] text-[12.5px]' : 'h-7 px-[9px] text-[12.5px]'
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
    className='inline-flex h-[30px] gap-px rounded-[7px] border border-line-2 bg-well p-[2px]'>
    {options.map(([option, name, mark]) => (
      <button
        key={option}
        type='button'
        aria-pressed={value === option}
        aria-label={mark ? name : undefined}
        title={mark ? name : undefined}
        onClick={() => onPick(option)}
        className={`inline-flex items-center justify-center gap-1.5 rounded-[5px] text-[12px] font-medium whitespace-nowrap ${mark ? 'w-[30px]' : 'px-[9px]'} ${
          value === option
            ? 'bg-pane text-ink shadow-[0_1px_2px_rgba(24,24,27,0.08),0_0_0_1px_rgba(24,24,27,0.04)]'
            : 'text-ink-2 hover:text-ink'
        }`}>
        {mark ?? name}
      </button>
    ))}
  </span>
)

export { Danger, Go, Mini, Seg, ToBin }
