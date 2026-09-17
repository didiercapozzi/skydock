/* The board has exactly two buttons. `Go` is the one thing a panel is asking to be done next, and
   there is never more than one of it in view; `Mini` is everything else — small, quiet, and at the
   right-hand end of the line it belongs to (RULES, The board). Keeping both here is what stops a
   third from being invented inline. */

type Props = {
  children: React.ReactNode
  title?: string
  disabled?: boolean
  /* a dialog's confirming button sits outside the form element it submits, so it says which one */
  type?: 'button' | 'submit'
  form?: string
  onClick?: () => void
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

const Mini = ({ children, title, disabled, type = 'button', form, onClick }: Props) => (
  <button
    type={type}
    form={form}
    title={title}
    disabled={disabled}
    onClick={onClick}
    className='rounded-[5px] border border-line bg-pane px-2 py-[3px] text-[11.5px] text-ink-2 hover:border-ink-3 hover:text-ink disabled:cursor-default disabled:opacity-40'>
    {children}
  </button>
)

/* A run of choices where exactly one is on: rows or thumbnails, auto or light or dark. The pressed
   one is filled rather than merely darker, because which one is on has to be readable at a glance
   in either theme. */
const Seg = <T extends string>({
  label,
  value,
  options,
  onPick
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onPick: (value: T) => void
}) => (
  <span
    role='group'
    aria-label={label}
    className='flex overflow-hidden rounded-md border border-line'>
    {options.map(([option, text]) => (
      <button
        key={option}
        type='button'
        aria-pressed={value === option}
        onClick={() => onPick(option)}
        className={`bg-pane px-[11px] py-[5px] text-[12px] ${
          value === option ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-2'
        }`}>
        {text}
      </button>
    ))}
  </span>
)

export { Go, Mini, Seg }
