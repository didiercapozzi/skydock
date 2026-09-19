/* Every dialog in the app is this shape: a title, a body that scrolls if it has to, and a row of
   buttons at the bottom with the one that does the thing on the right. Keeping the shell here is
   what stops five dialogs from each inventing their own padding. */

const Modal = ({
  label,
  title,
  wide,
  full,
  onClose,
  children,
  footer,
  ...rest
}: {
  label: string
  title: React.ReactNode
  wide?: boolean
  /* the whole window, for two things shown side by side */
  full?: boolean
  /* clicking the backdrop closes; a dialog that must not be dismissed that way leaves it out */
  onClose?: () => void
  children: React.ReactNode
  footer?: React.ReactNode
} & Record<`data-${string}`, string | undefined>) => (
  <div
    {...rest}
    onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}
    className='fixed inset-0 z-40 grid place-items-center bg-[rgba(8,12,16,0.5)] p-4'>
    <div
      role='dialog'
      aria-modal='true'
      aria-label={label}
      className={`flex max-h-full flex-col overflow-hidden rounded-xl border border-line bg-pane text-ink shadow-[0_20px_60px_rgba(0,0,0,0.35)] ${
        full ? 'h-[90vh] w-[90vw]' : wide ? 'w-[min(680px,100%)]' : 'w-[min(560px,100%)]'
      }`}>
      <h4 className='m-0 border-b border-line px-4 py-[13px] text-[14px] font-semibold'>{title}</h4>
      <div
        className={
          full
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
            : 'flex flex-col gap-2.5 overflow-auto px-4 py-3.5'
        }>
        {children}
      </div>
      {footer && (
        <div className='flex items-center gap-2 border-t border-line px-4 py-[11px]'>{footer}</div>
      )}
    </div>
  </div>
)

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
  'rounded-md border border-line bg-ground px-[9px] py-1.5 text-[13px] text-ink placeholder:text-ink-3 disabled:opacity-50'

const ERROR = 'rounded-md bg-local-soft px-2.5 py-[7px] text-[12.5px] text-local'

/* one line of what a dialog proves, deletes or keeps, marked with what happens to it */
const Line = ({ mark, children }: { mark: string; children: React.ReactNode }) => (
  <li className='flex gap-2 text-[12.5px] text-ink-2'>
    <span className='w-3 flex-none text-center'>{mark}</span>
    <span>{children}</span>
  </li>
)

export { ERROR, Field, INPUT, Line, Modal, Spacer }
