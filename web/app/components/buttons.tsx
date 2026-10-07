type Props = {
  children: React.ReactNode
  title?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  form?: string
  onClick?: () => void
  pressed?: boolean
}

const Go = ({ children, title, disabled, type = 'button', form, onClick }: Props) => (
  <button
    type={type}
    form={form}
    title={title}
    disabled={disabled}
    onClick={onClick}
    className='inline-flex h-control items-center justify-center gap-2 rounded-corner go-fill px-4 text-body font-bold whitespace-nowrap text-on-accent shadow-lift hover:brightness-110 disabled:cursor-default disabled:opacity-45 disabled:shadow-none'>
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
    className={`inline-flex h-control-sm items-center justify-center gap-1.5 rounded-corner px-3.5 text-body font-bold whitespace-nowrap shadow-card disabled:cursor-default disabled:opacity-40 ${
      pressed ? 'bg-accent-soft text-accent-ink' : 'bg-pane text-accent-ink hover:bg-accent-soft'
    }`}>
    {children}
  </button>
)

const BinIcon = () => (
  <svg
    aria-hidden='true'
    viewBox='0 0 16 16'
    className='h-3.25 w-3.25 flex-none'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.5'
    strokeLinecap='round'
    strokeLinejoin='round'>
    <path d='M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v5M9.2 6.5v5' />
  </svg>
)

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
    className={`inline-flex items-center justify-center gap-1.5 rounded-corner bg-pane font-bold whitespace-nowrap text-bin shadow-card hover:bg-bin-soft disabled:cursor-default disabled:opacity-45 ${
      size === 'go' ? 'h-control px-3.5 text-body' : 'h-control-sm px-3 text-body'
    }`}>
    {children}
  </button>
)

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
    className={`inline-flex items-center justify-center gap-1.5 rounded-corner bg-bin font-bold whitespace-nowrap text-on-bin hover:brightness-110 disabled:cursor-default disabled:opacity-45 ${
      size === 'go' ? 'h-control px-3.5 text-body' : 'h-control-sm px-3 text-body'
    }`}>
    <BinIcon />
    {children}
  </button>
)

const Seg = <T extends string>({
  label,
  value,
  options,
  wide = false,
  onPick
}: {
  label: string
  value: T
  options: readonly (readonly [T, string] | readonly [T, string, string])[]
  wide?: boolean
  onPick: (value: T) => void
}) => (
  <span
    role='group'
    aria-label={label}
    className={`h-10 gap-0.5 rounded-corner bg-well p-1 shadow-inset ${wide ? 'flex w-full' : 'inline-flex'}`}>
    {options.map(([option, name, mark]) => (
      <button
        key={option}
        type='button'
        aria-pressed={value === option}
        aria-label={mark ? name : undefined}
        title={mark ? name : undefined}
        onClick={() => onPick(option)}
        className={`inline-flex items-center justify-center gap-1.5 rounded-corner text-lead font-semibold whitespace-nowrap transition-colors duration-150 ${wide ? 'flex-1' : mark ? 'w-8' : 'px-4'} ${
          value === option
            ? 'bg-pane text-accent-ink shadow-card'
            : 'text-ink-2 hover:bg-pane/60 hover:text-accent-ink'
        }`}>
        {mark ?? name}
      </button>
    ))}
  </span>
)

export { Danger, Go, Mini, Seg, ToBin }
